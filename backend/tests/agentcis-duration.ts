/**
 * extractStudyOptions — duration parsing for AgentCIS products. AgentCIS sends `duration` as a
 * single free-text string ("2 Years", "18 Months"), not a split value/unit pair.
 *
 * Pure — no database, no model. Run it directly:
 *   node --import tsx tests/agentcis-duration.ts
 */
import { extractStudyOptions } from "../src/modules/superadmin/data-extraction/lib/agentcis-product-mappers.js";
import { durationToWeeks, coerceInt } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

let passed = 0;
let failed = 0;

function ok(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function firstOption(p: Record<string, unknown>) {
  return extractStudyOptions(p)[0];
}

// Confirms the bug this fix targets: Number("2 years") is NaN, not 2.
ok(Number.isNaN(Number("2 years")), true, "sanity: Number() on a duration string is NaN");

ok(firstOption({ duration: "2 years" }).duration_value, 2, "'2 years' -> value 2");
ok(firstOption({ duration: "2 years" }).duration_unit, "years", "'2 years' -> unit years");

ok(firstOption({ duration: "18 Months" }).duration_value, 18, "'18 Months' -> value 18");
ok(firstOption({ duration: "18 Months" }).duration_unit, "months", "'18 Months' -> unit months");

ok(firstOption({ duration: "1.5 Years" }).duration_value, 1.5, "'1.5 Years' -> value 1.5 (decimal)");
ok(firstOption({ duration: "1.5 Years" }).duration_unit, "years", "'1.5 Years' -> unit years");

ok(firstOption({ duration: "6 weeks" }).duration_value, 6, "'6 weeks' -> value 6");
ok(firstOption({ duration: "6 weeks" }).duration_unit, "weeks", "'6 weeks' -> unit weeks");

ok(firstOption({ duration: null }).duration_value, null, "null duration -> value null");
ok(firstOption({ duration: null }).duration_unit, null, "null duration -> unit null");

// Legacy split fields (not what AgentCIS sends today, but kept working in case any source does).
ok(firstOption({ duration_value: 3, duration_unit: "years" }).duration_value, 3, "split fields -> value 3");
ok(firstOption({ duration_value: 3, duration_unit: "years" }).duration_unit, "years", "split fields -> unit years");

// A bare number with no unit word at all still falls back to weeks, same as before this fix.
ok(firstOption({ duration: "12" }).duration_value, 12, "'12' with no unit -> value 12");
ok(firstOption({ duration: "12" }).duration_unit, "weeks", "'12' with no unit -> falls back to weeks");

// Greptile P1: semester-based durations were falling through to the weeks default (the local
// regex only knew year/month/week/day), staging a 104-week course as 4 weeks. Fixed by routing
// through the shared parseDurationText, which already recognises semesters/terms/trimesters.
ok(firstOption({ duration: "4 Semesters" }).duration_value, 4, "'4 Semesters' -> value 4");
ok(firstOption({ duration: "4 Semesters" }).duration_unit, "semesters", "'4 Semesters' -> unit semesters, not weeks");
ok(durationToWeeks(4, "semesters"), 104, "durationToWeeks(4, semesters) -> 104 weeks, matching Greptile's own example");
ok(firstOption({ duration: "2 Terms" }).duration_unit, "semesters", "'2 Terms' -> unit semesters");
ok(firstOption({ duration: "3 Trimesters" }).duration_unit, "semesters", "'3 Trimesters' -> unit semesters");

// Greptile P1: extraction_study_options.duration_value is an integer column; "1.5 Years" parses
// to a decimal, which Postgres rejects on insert. coerceInt (applied at the DB-write call site in
// agentcis-product-staging.ts, mirrored here since that call needs a live DB) floors it safely.
ok(coerceInt(1.5), 1, "coerceInt(1.5) -> 1 (floored, safe for an integer column)");
ok(coerceInt(firstOption({ duration: "1.5 Years" }).duration_value), 1, "'1.5 Years' study option value, coerced -> 1");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
