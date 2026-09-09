/**
 * Guards for intake date precision. No DB, no network.
 *
 *   npm run test:partial-date
 *
 * The case that matters most is the first one: `coerceDate("September 2026")` used to return
 * "2026-09-01" — a day Stanford never published, and afterwards indistinguishable from a real
 * 1 September. Every assertion here exists to keep a day from being invented.
 */

import {
  PARTIAL_DATE_RE,
  coercePartialDate,
  datePrecision,
  formatPartialDate,
  isPartialDate,
  monthOf,
  morePrecise,
  partialDatesAgree,
} from "../src/modules/superadmin/data-extraction/lib/partial-date.js";

let passed = 0;
let failed = 0;

function assert(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label ? label + ": " : ""}expected ${e}, got ${a}`);
}

console.log("\ncoercePartialDate — a day is never invented");
assert("a month with no day stays a month", () => eq(coercePartialDate("September 2026"), "2026-09"));
assert("the short month form too", () => eq(coercePartialDate("Sep 2026"), "2026-09"));
assert("an already-partial value is a no-op", () => eq(coercePartialDate("2026-09"), "2026-09"));
assert("a full date keeps its day", () => eq(coercePartialDate("September 21, 2026"), "2026-09-21"));
assert("day-first prose", () => eq(coercePartialDate("21 September 2026"), "2026-09-21"));
assert("an ordinal day", () => eq(coercePartialDate("21st September 2026"), "2026-09-21"));
assert("ISO in, ISO out", () => eq(coercePartialDate("2026-09-21"), "2026-09-21"));
assert("an ISO timestamp loses only its time", () =>
  eq(coercePartialDate("2026-09-21T00:00:00.000Z"), "2026-09-21"));
assert("a month with no year is not placeable", () => eq(coercePartialDate("September"), null));
assert("prose with no month is not a date", () => eq(coercePartialDate("Rolling admission 2026"), null));
assert("junk is null, not a guess", () => {
  eq(coercePartialDate("TBA"), null);
  eq(coercePartialDate(""), null);
  eq(coercePartialDate(null), null);
  eq(coercePartialDate(undefined), null);
});
assert("an academic-year label yields no date", () => eq(coercePartialDate("Autumn 2026-2027"), null));
assert("the 0000 sentinel is rejected", () => eq(coercePartialDate("0000-01-01"), null));
assert("an impossible day falls back to the month, never rolls over", () =>
  eq(coercePartialDate("31 February 2026"), "2026-02"));
assert("a 13th month is not a date", () => eq(coercePartialDate("2026-13"), null));
// A four-digit year inside the string must not be mistaken for the day.
assert("the year is not read as a day", () => eq(coercePartialDate("2026 September"), "2026-09"));

// Inherited from tests/coerce-date.ts, which covered coerceDate before this replaced it.
// bulletin.gwu.edu's MA International Affairs page has a recurring "Priority Deadline: January 7"
// with no year, so the LLM filled in "0000" — ISO-shaped but not a real date, which Postgres
// rejected outright ("date/time field value out of range: 0000-01-07").
console.log("\ncoercePartialDate — the gwu.edu year-0000 regression");
assert("year 0000, the LLM's unknown-year placeholder, is rejected", () =>
  eq(coercePartialDate("0000-01-07"), null));
assert("a real ISO date passes through unchanged", () =>
  eq(coercePartialDate("2026-01-07"), "2026-01-07"));
assert("a deadline with no year at all is null", () => eq(coercePartialDate("February 15"), null));
assert("natural language with a real year parses", () =>
  eq(coercePartialDate("Feb 15, 2026"), "2026-02-15"));

console.log("\ndatePrecision / isPartialDate");
assert("a month reads as month precision", () => eq(datePrecision("2026-09"), "month"));
assert("a full date reads as full_date", () => eq(datePrecision("2026-09-21"), "full_date"));
assert("absent has no precision", () => {
  eq(datePrecision(null), null);
  eq(datePrecision("nonsense"), null);
});
assert("a fabricated first-of-month is still full_date — precision is the value's shape", () =>
  eq(datePrecision("2026-09-01"), "full_date"));
assert("isPartialDate rejects a day-less non-date", () => {
  eq(isPartialDate("2026"), false);
  eq(isPartialDate("2026-9"), false);
});
assert("monthOf spans both precisions", () => {
  eq(monthOf("2026-09-21"), "2026-09");
  eq(monthOf("2026-09"), "2026-09");
});

// The database enforces the same rule as a CHECK constraint (migration 20260909_001), written as
// two anchored alternatives because knex.raw eats a `?` quantifier as a binding placeholder. If
// the two ever disagree, JS accepts a value Postgres rejects and the write fails as a 500 rather
// than a 400 — so they are compared here over the cases that distinguish them.
console.log("\nthe SQL CHECK and the JS regex accept exactly the same values");
const SQL_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$|^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
assert("SQL and JS patterns agree on every boundary case", () => {
  const cases = [
    "2026-09", "2026-09-21", "2026-01-01", "2026-12-31", "2026-02-29",
    "2026-00", "2026-13", "2026-09-00", "2026-09-32", "2026-9", "2026-09-1",
    "2026", "", "2026-09-21T00:00:00Z", "0000-01-07", "20260921", "2026/09/21",
  ];
  for (const c of cases) {
    const js = PARTIAL_DATE_RE.test(c);
    const sql = SQL_PATTERN.test(c);
    if (js !== sql) throw new Error(`${JSON.stringify(c)}: JS ${js}, SQL ${sql}`);
  }
});
// Anything coercePartialDate emits must survive the constraint, or a scrape 500s on write.
assert("every value the coercer produces satisfies the constraint", () => {
  const inputs = [
    "September 2026", "21 September 2026", "2026-09-21", "Feb 15, 2026", "31 February 2026",
    "Sep 2026", "21st September 2026", "2026-09-21T00:00:00.000Z", "2026 September",
  ];
  for (const i of inputs) {
    const out = coercePartialDate(i);
    if (out != null && !SQL_PATTERN.test(out)) throw new Error(`${i} -> ${out} fails the CHECK`);
  }
});

console.log("\npartialDatesAgree — the rule upsertIntake shares a row on");
assert("a missing side is unknown, not a difference", () => {
  eq(partialDatesAgree(null, "2026-09-21"), true);
  eq(partialDatesAgree("2026-09-21", null), true);
});
assert("the same full date agrees", () => eq(partialDatesAgree("2026-09-21", "2026-09-21"), true));
assert("different days in one month disagree", () =>
  eq(partialDatesAgree("2026-09-21", "2026-09-28"), false));
assert("a month agrees with any day inside it", () => {
  eq(partialDatesAgree("2026-09", "2026-09-21"), true);
  eq(partialDatesAgree("2026-09-21", "2026-09"), true);
});
assert("a month disagrees with another month", () =>
  eq(partialDatesAgree("2026-09", "2026-10"), false));
assert("a Date from pg is comparable", () =>
  eq(partialDatesAgree(new Date(Date.UTC(2026, 8, 21)), "2026-09-21"), true));

console.log("\nmorePrecise — enriching a shared row");
assert("a day beats a bare month", () => eq(morePrecise("2026-09", "2026-09-21"), "2026-09-21"));
assert("order does not matter", () => eq(morePrecise("2026-09-21", "2026-09"), "2026-09-21"));
assert("something beats nothing", () => {
  eq(morePrecise(null, "2026-09"), "2026-09");
  eq(morePrecise("2026-09", null), "2026-09");
  eq(morePrecise(null, null), null);
});

console.log("\nformatPartialDate — how it reads to a person");
assert("a month renders without a day", () => eq(formatPartialDate("2026-09"), "September 2026"));
assert("a full date renders with one", () => eq(formatPartialDate("2026-09-21"), "21 September 2026"));
assert("nothing renders as nothing", () => eq(formatPartialDate(null), null));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
