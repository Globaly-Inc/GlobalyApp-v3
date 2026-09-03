/**
 * Saved-items toggle tests — repository-level against the real dev DB.
 * Run: node --import tsx tests/saved-items.ts
 *
 * The interesting behaviour is concurrency: the toggle has to decide its direction and write it
 * in one statement, or two overlapping taps collapse into a single state transition. That can
 * only be exercised against a real database, so this talks to the dev DB directly and cleans up
 * the rows it made.
 */

import { pathToFileURL } from "node:url";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as repo from "../src/modules/saved-items/repositories/saved-items.repository.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// The toggle is type-agnostic; "institution" is used so this fixture id cannot collide with a
// real course uuid.
const TYPE = "institution" as const;
const ITEM_ID = "test-toggle-item";

/** Returns the number of failures, so a caller can decide the exit code. */
export async function runSavedItemsTests(): Promise<number> {
  console.log("Saved-items toggle tests (DB integration)\n");

  const user = await masterKnex("platform_users").whereNull("deleted_at").first("id");
  if (!user) {
    console.log("  ! no platform_users row here — every assert needs one, skipping\n");
    return 0;
  }
  const userId = Number(user.id);

  const fixture = () =>
    masterKnex("saved_items").where({ platform_user_id: userId, item_type: TYPE, item_id: ITEM_ID });
  const reset = () => fixture().delete();
  const currentlySaved = async () => Boolean(await fixture().whereNull("deleted_at").first("id"));

  await reset();

  await assert("first toggle saves, second un-saves", async () => {
    eq(await repo.toggleItem(userId, TYPE, ITEM_ID), true, "after 1st toggle");
    eq(await currentlySaved(), true, "row state after 1st");
    eq(await repo.toggleItem(userId, TYPE, ITEM_ID), false, "after 2nd toggle");
    eq(await currentlySaved(), false, "row state after 2nd");
  });

  await assert("revives the soft-deleted row instead of inserting a second one", async () => {
    await repo.toggleItem(userId, TYPE, ITEM_ID);
    const [{ count }] = await fixture().count("id as count");
    eq(Number(count), 1, "row count after save/unsave/save");
  });

  // The regression this guards: with a read-then-write toggle both statements observe the same
  // starting state, both write the same value, and two taps produce one transition.
  await assert("two overlapping toggles produce two transitions, not one", async () => {
    await reset();
    const before = await currentlySaved();

    const results = await Promise.all([
      repo.toggleItem(userId, TYPE, ITEM_ID),
      repo.toggleItem(userId, TYPE, ITEM_ID),
    ]);

    // One lands saved and the other un-saved, in whichever order they took the row lock, so the
    // net effect of an even number of toggles is no change at all.
    eq(results.filter(Boolean).length, 1, "exactly one of the two reports 'saved'");
    eq(await currentlySaved(), before, "net state after two toggles");
  });

  await assert("a non-uuid course id is rejected before it reaches the query", async () => {
    // Each of these is 36 characters, so a length-only guard would wave them through and
    // Postgres would abort the statement rather than answering "no such course".
    eq(await repo.coursePublicById("-".repeat(36)), false, "all hyphens");
    eq(await repo.coursePublicById("a".repeat(36)), false, "hex, no hyphens");
    eq(await repo.coursePublicById("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"), false, "non-hex");
    eq(await repo.coursePublicById(""), false, "empty");
  });

  await reset();

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runSavedItemsTests();
  await masterKnex.destroy();
  process.exit(failures > 0 ? 1 : 0);
}
