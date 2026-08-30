/**
 * Page-view counter tests — repository-level against the real dev DB.
 * Run: node --import tsx tests/page-views.ts   (or: npm run test:page-views)
 *
 * Same reason as tests/saved-items.ts for talking to a real database: the interesting behaviour is
 * that concurrent visits each count, which only the row lock in the upsert provides. Cleans up the
 * fixture rows it makes.
 */

import { pathToFileURL } from "node:url";
import { masterKnex } from "../src/core/db/master-pool.js";
import { STARTING_VIEWS } from "../src/modules/page-views/consts.js";
import { bumpViews } from "../src/modules/page-views/repositories/page-views.repository.js";

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

const TYPE = "business" as const;
const ENTITY_ID = "test-page-views-fixture";

/** Returns the number of failures, so a caller can decide the exit code. */
export async function runPageViewsTests(): Promise<number> {
  console.log("Page-view counter tests (DB integration)\n");

  const fixture = () => masterKnex("page_views").where({ entity_type: TYPE, entity_id: ENTITY_ID });
  const reset = () => fixture().delete();

  await reset();

  await assert("the first visit lands on the starting count, then each visit adds one", async () => {
    eq(await bumpViews(TYPE, ENTITY_ID), STARTING_VIEWS, "1st visit");
    eq(await bumpViews(TYPE, ENTITY_ID), STARTING_VIEWS + 1, "2nd visit");
    eq(await bumpViews(TYPE, ENTITY_ID), STARTING_VIEWS + 2, "3rd visit");
  });

  await assert("one row per page, not one per visit", async () => {
    const [{ count }] = await fixture().count("id as count");
    eq(Number(count), 1, "row count after three visits");
  });

  // The regression this guards: with a read-then-write bump both statements read the same total and
  // write the same value, so simultaneous visitors count as one.
  await assert("overlapping visits all count", async () => {
    await reset();
    const results = await Promise.all(Array.from({ length: 5 }, () => bumpViews(TYPE, ENTITY_ID)));
    eq(
      [...results].sort((a, b) => a - b).join(","),
      [0, 1, 2, 3, 4].map((n) => STARTING_VIEWS + n).join(","),
      "each visit got its own number",
    );
  });

  await assert("counts are per page, not shared", async () => {
    const other = `${ENTITY_ID}-2`;
    await masterKnex("page_views").where({ entity_type: TYPE, entity_id: other }).delete();
    eq(await bumpViews(TYPE, other), STARTING_VIEWS, "a second page starts fresh");
    await masterKnex("page_views").where({ entity_type: TYPE, entity_id: other }).delete();
  });

  await reset();

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runPageViewsTests();
  await masterKnex.destroy();
  process.exit(failures > 0 ? 1 : 0);
}
