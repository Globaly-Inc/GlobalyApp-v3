/**
 * Pure-logic guards for the eligibility/intake extraction fixes. No DB, no network.
 *
 *   npm run test:eligibility-extraction
 *
 * The case that matters most is the first one: a real scraped requirement read
 * "Average quantitative GMAT scores are 49.5 (95th percentile)." and the pipeline stored 95 as a
 * minimum percentage grade, which the public course page rendered as "Minimum score: 95%" and the
 * eligibility engine compared against real students' GPAs. If deriveScoreFromDescription ever
 * starts reading numbers out of statistical prose again, this file fails.
 */

import {
  deriveScoreFromDescription,
  deriveIntakeMonthYear,
  normaliseAcademicTests,
  eligibilityRowsAgree,
  englishUpdates,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import { evaluateEligibility } from "../src/modules/enquiries/shared/eligibility.js";
import { findTests, testPattern } from "../src/modules/superadmin/data-extraction/lib/requirement-text.js";

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

console.log("eligibility + intake extraction logic\n");

console.log("deriveScoreFromDescription — statistics are not requirements");
// The exact string from job 3e4a6521 that produced the fabricated 95%.
assert("percentile in the reported bug is not a minimum", () =>
  eq(deriveScoreFromDescription("Average quantitative GMAT scores are 49.5 (95th percentile)."), null));
assert("cohort average is not a minimum", () =>
  eq(deriveScoreFromDescription("The average GPA of our incoming class is 3.8"), null));
assert("median is not a minimum", () =>
  eq(deriveScoreFromDescription("Median GRE quantitative score of 165"), null));
assert("'top 10%' is not a minimum", () =>
  eq(deriveScoreFromDescription("Applicants are typically in the top 10% of their cohort"), null));
assert("acceptance rate is not a minimum", () =>
  eq(deriveScoreFromDescription("Our acceptance rate is 12%"), null));
assert("share of applicants is not a minimum", () =>
  eq(deriveScoreFromDescription("85% of applicants hold a prior degree"), null));
assert("employment outcome is not a minimum", () =>
  eq(deriveScoreFromDescription("94% employment rate within six months"), null));

console.log("\nderiveScoreFromDescription — real thresholds still derive");
assert("plain percentage threshold", () =>
  eq(deriveScoreFromDescription("Requires 65% in a bachelor degree"), { score_type: "percentage", value: 65 }));
assert("bare GPA defaults to the 4.0 scale", () =>
  eq(deriveScoreFromDescription("Minimum GPA of 3.0"), { score_type: "gpa_4", value: 3.0 }));
assert("explicit 10-point GPA", () =>
  eq(deriveScoreFromDescription("GPA of 7.5 out of 10"), { score_type: "gpa_10", value: 7.5 }));
assert("CGPA named specifically", () =>
  eq(deriveScoreFromDescription("A CGPA of 6.5 is required"), { score_type: "cgpa", value: 6.5 }));
assert("no number means no score", () =>
  eq(deriveScoreFromDescription("A relevant bachelor degree or equivalent experience"), null));
assert("empty description", () => eq(deriveScoreFromDescription(null), null));

console.log("\nnormaliseAcademicTests");
assert("keeps a named test and stringifies its score", () =>
  eq(normaliseAcademicTests([{ test_name: " GMAT ", score: 49.5 }]),
    [{ test_name: "GMAT", score: "49.5", typical_score: null, is_optional: false }]));
assert("carries is_optional through", () =>
  eq(normaliseAcademicTests([{ test_name: "GRE", score: "320", is_optional: true }]),
    [{ test_name: "GRE", score: "320", typical_score: null, is_optional: true }]));
assert("a test with no score is still worth recording", () =>
  eq(normaliseAcademicTests([{ test_name: "LSAT" }]),
    [{ test_name: "LSAT", score: null, typical_score: null, is_optional: false }]));
assert("typical_score survives on its own", () =>
  eq(normaliseAcademicTests([{ test_name: "GMAT", typical_score: 49.5 }]),
    [{ test_name: "GMAT", score: null, typical_score: "49.5", is_optional: false }]));
assert("a real minimum drops the redundant cohort figure", () =>
  eq(normaliseAcademicTests([{ test_name: "GRE", score: "320", typical_score: "330" }]),
    [{ test_name: "GRE", score: "320", typical_score: null, is_optional: false }]));
assert("drops entries with no name", () =>
  eq(normaliseAcademicTests([{ score: "700" }, { test_name: "  " }]), []));
assert("non-array input is empty, not a crash", () => eq(normaliseAcademicTests("GMAT"), []));
assert("defaults is_optional to false, never undefined", () =>
  eq(normaliseAcademicTests([{ test_name: "SAT", score: "1200" }])[0].is_optional, false));

console.log("\nderiveIntakeMonthYear — the columns search actually reads");
assert("year out of a semester name", () =>
  eq(deriveIntakeMonthYear("Semester 1 2027", null, null, null), { intake_month: null, intake_year: 2027 }));
assert("month and year out of a month name", () =>
  eq(deriveIntakeMonthYear("February 2026 intake", null, null, null), { intake_month: 2, intake_year: 2026 }));
assert("falls back to start_date", () =>
  eq(deriveIntakeMonthYear(null, "2026-09-14", null, null), { intake_month: 9, intake_year: 2026 }));
assert("name wins over start_date for the year it states", () =>
  eq(deriveIntakeMonthYear("Fall 2027", "2026-09-14", null, null), { intake_month: 9, intake_year: 2027 }));
assert("an explicit value is never overwritten", () =>
  eq(deriveIntakeMonthYear("February 2026", null, 7, 2030), { intake_month: 7, intake_year: 2030 }));
assert("'Semester 1' does not become month 1", () =>
  eq(deriveIntakeMonthYear("Semester 1", null, null, null), { intake_month: null, intake_year: null }));
assert("a short month form is matched", () =>
  eq(deriveIntakeMonthYear("Sep 2026", null, null, null), { intake_month: 9, intake_year: 2026 }));
assert("a short form does not match inside a long one", () =>
  eq(deriveIntakeMonthYear("September 2026", null, null, null), { intake_month: 9, intake_year: 2026 }));
assert("nothing derivable stays null", () =>
  eq(deriveIntakeMonthYear("Rolling admission", null, null, null), { intake_month: null, intake_year: null }));
assert("a 2-digit number is not a year", () =>
  eq(deriveIntakeMonthYear("Intake 27", null, null, null), { intake_month: null, intake_year: null }));

console.log("\nfindTests — recovering tests from stored requirement text (backfill)");
// Longest-first, as loadAcademicTests() sorts it.
const CAT = ["GMAT", "GRE", "SAT", "ACT", "LSAT", "MCAT"].sort((a, b) => b.length - a.length);
const mine = (name: string, desc: string) => findTests(`${name}. ${desc}`, CAT);

// The two live rows from job 3e4a6521. Both state a cohort statistic, not a bar — recording the
// test with no minimum is the correct answer, and lifting 49.5/167 into `score` would re-create
// the fabrication one column to the left.
// A cohort statistic keeps its number, but as typical_score — not as a bar. Losing 49.5 entirely
// would throw away a figure students want; calling it a minimum is the original bug.
assert("a cohort average becomes typical_score, never score", () =>
  eq(mine("GMAT Quantitative Score (Optional)", "Average quantitative GMAT scores are 49.5 (95th percentile)."),
    [{ test_name: "GMAT", score: null, typical_score: "49.5", is_optional: true }]));
assert("a median becomes typical_score, never score", () =>
  eq(mine("GRE Quantitative Score (Optional)", "Median GRE quantitative score for entering classes is 167."),
    [{ test_name: "GRE", score: null, typical_score: "167", is_optional: true }]));
assert("the live GRE row, verbatim", () =>
  eq(mine("GRE Quantitative Score (Optional)",
      "Median GRE quantitative score for entering classes is 167. Neither GRE nor GMAT are strictly required, but submission is accepted."),
    [{ test_name: "GMAT", score: null, typical_score: null, is_optional: true },
     { test_name: "GRE", score: null, typical_score: "167", is_optional: true }]));

assert("a real stated minimum is captured as score", () =>
  eq(mine("Admission test", "A minimum GRE score of 320 is required for all applicants."),
    [{ test_name: "GRE", score: "320", typical_score: null, is_optional: false }]));
assert("'at least' is a minimum", () =>
  eq(mine("Standardised testing", "Applicants must submit a GMAT of at least 650."),
    [{ test_name: "GMAT", score: "650", typical_score: null, is_optional: false }]));
assert("two tests in one sentence keep their own scores", () =>
  eq(mine("Undergraduate entry", "SAT of 1200 or ACT of 25 required."),
    [{ test_name: "SAT", score: "1200", typical_score: null, is_optional: false },
     { test_name: "ACT", score: "25", typical_score: null, is_optional: false }]));
assert("a calendar year is neither a score nor a typical score", () =>
  eq(mine("Test optional policy", "SAT and ACT scores are optional for 2027 entry."),
    [{ test_name: "SAT", score: null, typical_score: null, is_optional: true },
     { test_name: "ACT", score: null, typical_score: null, is_optional: true }]));
assert("a semicolon stops the score search", () =>
  eq(mine("Law entry", "LSAT of 160 required; GPA of 3.5 expected."),
    [{ test_name: "LSAT", score: "160", typical_score: null, is_optional: false }]));
assert("a real minimum wins over an average in the same text", () =>
  eq(mine("Entry", "Average GMAT is 700. A minimum GMAT of 600 is required."),
    [{ test_name: "GMAT", score: "600", typical_score: null, is_optional: false }]));
assert("no test named means no tests", () =>
  eq(mine("Academic entry", "Requires a bachelor degree with 65% overall."), []));
assert("'not a strict requirement' reads as optional", () =>
  eq(mine("Testing", "Neither GRE nor GMAT are strict requirements.")[0].is_optional, true));
assert("an English test is not an academic test", () =>
  eq(mine("Language", "IELTS 6.5 overall required."), []));

// public.tests is admin-managed, so a name is data. Unescaped, "C++" is a nested quantifier that
// throws and aborts an --apply run mid-way through, after pass 1 has already committed.
console.log("\ntestPattern — catalogue names are data, not regex literals");
const ODD = ["TOEFL (iBT)", "C++", "A-Level", "Test.Plus"];
assert("a name with regex syntax doesn't throw", () =>
  ODD.forEach((n) => testPattern(n, "gi")));
assert("a parenthesised name matches itself, not its inner group", () => {
  eq(testPattern("TOEFL (iBT)", "i").test("Requires TOEFL (iBT) of 90."), true);
  eq(testPattern("TOEFL (iBT)", "i").test("Requires TOEFL iBT of 90."), false);
});
assert("a name ending in a non-word char still matches", () =>
  eq(findTests("Entry. TOEFL (iBT) of 90 required.", ["TOEFL (iBT)"]),
    [{ test_name: "TOEFL (iBT)", score: "90", typical_score: null, is_optional: false }]));
assert("a '+' in a name is literal, not a quantifier", () =>
  eq(testPattern("C++", "i").test("C++ exam"), true));
assert("a '.' in a name is literal", () =>
  eq(testPattern("Test.Plus", "i").test("TestXPlus"), false));

// Name + audience is not an identity: institutions reuse "Admission test" across courses that
// demand different things, and merging them judged one course against the other's threshold.
console.log("\neligibilityRowsAgree — a shared name is not a shared requirement");
assert("differing minimums are different requirements", () =>
  eq(eligibilityRowsAgree({ min_score: "300.00" }, { min_score: 320 }), false));
assert("the same minimum through pg's decimal-as-string shares a row", () =>
  eq(eligibilityRowsAgree({ min_score: "300.00" }, { min_score: 300 }), true));
assert("a blank on either side is unknown, not a disagreement", () => {
  eq(eligibilityRowsAgree({ min_score: null }, { min_score: 320 }), true);
  eq(eligibilityRowsAgree({ min_score: "320" }, { min_score: null }), true);
});
assert("differing degree levels are different requirements", () =>
  eq(eligibilityRowsAgree({ min_degree_level: "Bachelor" }, { min_degree_level: "Master" }), false));
assert("degree level compares case-insensitively", () =>
  eq(eligibilityRowsAgree({ min_degree_level: "Bachelor" }, { min_degree_level: "bachelor" }), true));
assert("differing score types are different requirements", () =>
  eq(eligibilityRowsAgree({ score_type: "gpa_4" }, { score_type: "percentage" }), false));
assert("the same test scored differently forks a row", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", score: "300" }] },
    { academic_tests: JSON.stringify([{ test_name: "GRE", score: "320" }]) }), false));
// academic_tests is only ever written over the '[]' default, so a test named on one side is NOT
// added to the other — it is dropped, and that course is then judged by the stored row's tests.
assert("different tests fork a row — the incoming one would be dropped, not merged", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", score: "320" }] },
    { academic_tests: JSON.stringify([{ test_name: "GMAT", score: "650" }]) }), false));
assert("required vs optional forks a row — is_optional gates the verdict", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", score: "320", is_optional: false }] },
    { academic_tests: JSON.stringify([{ test_name: "GRE", score: "320", is_optional: true }]) }), false));
assert("a stated minimum never shares a row with a cohort average only", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", typical_score: "167" }] },
    { academic_tests: JSON.stringify([{ test_name: "GRE", score: "320" }]) }), false));
assert("an extra test forks a row", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", score: "320" }] },
    { academic_tests: JSON.stringify([
      { test_name: "GRE", score: "320" }, { test_name: "GMAT", score: "650" }]) }), false));
assert("the same tests in a different order still share a row", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GMAT", score: "650" }, { test_name: "GRE", score: "320" }] },
    { academic_tests: JSON.stringify([
      { test_name: "GRE", score: "320" }, { test_name: "GMAT", score: "650" }]) }), true));
assert("differing typical scores still share a row — an average gates nothing", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", typical_score: "167" }] },
    { academic_tests: JSON.stringify([{ test_name: "GRE", typical_score: "160" }]) }), true));
// Deliberate asymmetry: pages describe one institution-level requirement at different levels of
// detail, and forking on absence would fork nearly every row.
assert("a row naming no tests stays compatible with one that does", () => {
  eq(eligibilityRowsAgree({ academic_tests: [{ test_name: "GRE", score: "320" }] },
    { academic_tests: "[]" }), true);
  eq(eligibilityRowsAgree({ academic_tests: [] },
    { academic_tests: JSON.stringify([{ test_name: "GRE", score: "320" }]) }), true);
});
assert("a nameless test entry is ignored, not treated as a rule", () =>
  eq(eligibilityRowsAgree(
    { academic_tests: [{ test_name: "GRE", score: "320" }] },
    { academic_tests: JSON.stringify([
      { test_name: "GRE", score: "320" }, { test_name: "  ", score: "99" }]) }), true));
assert("the column default '[]' never blocks a match", () =>
  eq(eligibilityRowsAgree({ academic_tests: [] }, { academic_tests: "[]" }), true));
assert("unparseable stored json is not a disagreement", () =>
  eq(eligibilityRowsAgree({ academic_tests: "not json" }, { academic_tests: "[]" }), true));

// The caller in saveAndLearn relies on this: a null seed means "re-derive from the name", which is
// what makes an admin's "Fall 2026" -> "Fall 2027" correction actually take effect.
console.log("\nderiveIntakeMonthYear — seed semantics the admin-correction path depends on");
assert("a null seed lets a corrected name win", () =>
  eq(deriveIntakeMonthYear("Fall 2027", null, null, null).intake_year, 2027));
assert("a provided seed still wins", () =>
  eq(deriveIntakeMonthYear("Fall 2027", null, null, 2026).intake_year, 2026));

// extraction_english_requirements was the last child table written with a bare insert, so a course
// found on a listing page, its detail page and a catalog entry ended up with three IELTS rows —
// three tiles on the public card, and English weighted 3x in evaluateEligibility's percentage.
console.log("\nenglishUpdates — one row per test per course, blanks filled, bars never rewritten");
assert("a later page's band minimums fill in behind an overall-only row", () =>
  eq(englishUpdates(
    { overall_score: "6.5", reading_score: null },
    { overall_score: "6.5", reading_score: "6.0" }),
    { reading_score: "6.0" }));
assert("a page stating a different overall never rewrites the stated bar", () =>
  eq(englishUpdates({ overall_score: "6.5" }, { overall_score: "7.0" }), {}));
assert("an empty string counts as blank on the stored side", () =>
  eq(englishUpdates({ source_url: "" }, { source_url: "https://x.test/entry" }),
    { source_url: "https://x.test/entry" }));
assert("a null incoming value never blanks a stored one", () =>
  eq(englishUpdates({ overall_score: "6.5" }, { overall_score: null }), {}));
assert("nothing to do produces no update at all", () =>
  eq(englishUpdates({ overall_score: "6.5" }, { overall_score: "6.5" }), {}));

// A scraped section heading ("Target Audience Requirements") with no score, degree level, test or
// description produces a PATHWAY WITH ZERO CRITERIA. rollup([]) is "unknown", which outranks
// not_eligible, so that row spoke for the whole course and hid a real failure from the student.
//
// Note the english_requirements are empty in these cases on purpose: englishCriteria is appended to
// EVERY pathway, so a course with an English bar has no criteria-less pathway to begin with and
// exercises none of this.
console.log("\nevaluateEligibility — a requirement that states nothing cannot outrank a failure");
type EvalInput = Parameters<typeof evaluateEligibility>[0];
const NO_STUDENT: EvalInput["student"] = { qualifications: [], languageTests: [], academicTests: [] };
const belowBar: EvalInput["student"] = {
  qualifications: [{ qualification_type: "Bachelor", grading_system: "percentage", grade_value: "50", end_date: "2024-01-01" }],
  languageTests: [], academicTests: [],
};
const bareRow: EvalInput["requirements"][number] = {
  id: "bare", name: "Target Audience Requirements", applicable_to: "both",
  min_degree_level: null, min_score_percent: null, min_score_grade: null, score_type: null,
  min_score: null, description: null, academic_tests: null, language_tests: null,
};
const realRow: EvalInput["requirements"][number] = { ...bareRow, id: "real", name: "Academic Entry", min_score_percent: 65 };

assert("a bare heading row no longer masks the failed pathway beside it", () =>
  eq(evaluateEligibility({
    requirements: [bareRow, realRow], englishRequirements: [],
    degreeLadder: new Map(), student: belowBar, studentType: "international",
  }).status, "not_eligible"));
assert("the verdict is reported against the pathway that actually stated something", () =>
  eq(evaluateEligibility({
    requirements: [bareRow, realRow], englishRequirements: [],
    degreeLadder: new Map(), student: belowBar, studentType: "international",
  }).requirement_id, "real"));
assert("a real pass is still a pass with a bare row in the mix", () =>
  eq(evaluateEligibility({
    requirements: [bareRow, realRow], englishRequirements: [],
    degreeLadder: new Map(),
    student: { ...belowBar, qualifications: [{ ...belowBar.qualifications[0], grade_value: "80" }] },
    studentType: "international",
  }).status, "eligible"));
assert("a course whose only row states nothing still answers unknown", () =>
  eq(evaluateEligibility({
    requirements: [bareRow], englishRequirements: [],
    degreeLadder: new Map(), student: NO_STUDENT, studentType: "international",
  }).status, "unknown"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
