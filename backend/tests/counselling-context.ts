/**
 * Counselling-context test — asserts mergeCounsellingContext() unions lists without
 * duplicating, caps growth, overwrites the stage, and never drops what earlier turns
 * recorded. Also checks the context tool stays available on a discovery turn, which
 * is exactly when a student first says what they want.
 * Run: node --import tsx tests/counselling-context.ts  (or: npm run test:counselling-context)
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 * Pure merge logic only — no DB.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";

import { mergeCounsellingContext } from "../src/modules/ai-counsellor/repositories/sessions.repository.js";
import { toolsFor } from "../src/modules/ai-counsellor/lib/tools.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const assertEqual = (actual: unknown, expected: unknown, label: string) =>
  assert(actual === expected, label, { actual, expected });

const assertList = (actual: unknown, expected: string[], label: string) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), label, { actual, expected });

// 1. First write on an empty session.
{
  const merged = mergeCounsellingContext(null, {
    interests: ["mathematics"], stage: "exploring",
  });
  assertList(merged.interests, ["mathematics"], "records the first interest");
  assertEqual(merged.stage, "exploring", "records the stage");
}

// 2. Later turns add without losing earlier ones.
{
  const first = mergeCounsellingContext({}, { goals: ["work in AI"] });
  const second = mergeCounsellingContext(first, { constraints: ["budget under 30k"] });
  assertList(second.goals, ["work in AI"], "the earlier goal survives a later write");
  assertList(second.constraints, ["budget under 30k"], "the new constraint is added");
}

// 3. Duplicates never accumulate — the model repeating itself must not grow the list.
{
  const merged = mergeCounsellingContext(
    { preferred_countries: ["Australia"] },
    { preferred_countries: ["australia", "  Australia  ", "Canada"] },
  );
  assertList(merged.preferred_countries, ["Australia", "Canada"], "case and whitespace duplicates collapse");
}

// 4. Junk is dropped rather than stored.
{
  const merged = mergeCounsellingContext({}, {
    notes: ["  ", "", "real note"] as string[],
  });
  assertList(merged.notes, ["real note"], "blank entries are discarded");
  const empty = mergeCounsellingContext({ interests: ["maths"] }, { interests: [] });
  assertList(empty.interests, ["maths"], "an empty patch list leaves the stored list alone");
}

// 5. Growth is capped — this is injected into every prompt.
{
  let ctx = {};
  for (let i = 0; i < 20; i++) {
    ctx = mergeCounsellingContext(ctx, { notes: [`note ${i}`] });
  }
  const notes = (ctx as { notes?: string[] }).notes ?? [];
  assertEqual(notes.length, 8, "list length is capped");
  assertEqual(notes.at(-1), "note 19", "the newest item is kept");
  assertEqual(notes[0], "note 12", "the oldest items age out");
}

// 6. Stage overwrites — a student is in one stage at a time.
{
  const merged = mergeCounsellingContext({ stage: "exploring" }, { stage: "applying" });
  assertEqual(merged.stage, "applying", "the latest stage wins");
  const kept = mergeCounsellingContext({ stage: "applying" }, { interests: ["nursing"] });
  assertEqual(kept.stage, "applying", "a patch without a stage leaves it untouched");
}

// 7. The merge never mutates what it was given.
{
  const current = { interests: ["maths"] };
  mergeCounsellingContext(current, { interests: ["physics"] });
  assertList(current.interests, ["maths"], "the input context is not mutated");
}

// 8. The context tool survives a discovery turn — the first message is when a
//    student says what they want, so recording it must be possible there.
{
  const names = toolsFor({ discoveryTurn: true })
    .flatMap((t) => t.functionDeclarations?.map((d) => d.name) ?? []);
  assert(names.includes("update_student_context"), "discovery turn keeps update_student_context", names);
  assert(!names.includes("search_courses"), "discovery turn still withholds search_courses", names);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
