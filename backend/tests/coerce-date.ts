/**
 * coerceDate() regression test — reproduces the real bug: bulletin.gwu.edu's MA
 * International Affairs page has a recurring "Priority Deadline: January 7" with no
 * year stated, so the LLM filled in year "0000" (ISO-shaped but not a real date).
 * That went straight into the extraction_intakes insert and Postgres rejected it:
 * "date/time field value out of range: 0000-01-07".
 * Run: node --import tsx tests/coerce-date.ts
 */
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const { coerceDate } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");

  assertEqual(coerceDate("0000-01-07"), null, "year 0000 (LLM's unknown-year placeholder) is rejected, not passed through");
  assertEqual(coerceDate("2026-01-07"), "2026-01-07", "a real ISO date still passes through unchanged");
  assertEqual(coerceDate("February 15"), null, "a date with no year at all still returns null");
  assertEqual(coerceDate("Feb 15, 2026"), "2026-02-15", "a natural-language date with a real year still parses");
  assertEqual(coerceDate(null), null, "null stays null");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
