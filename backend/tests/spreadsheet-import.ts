/**
 * Spreadsheet import mapping — a mapped sheet row reshaped into an AgentCIS product must read back
 * correctly through the SAME AgentCIS mappers stageProduct uses. FIXTURES are real rows from the
 * first workbook imported (one tab per institution), not synthesized.
 *
 * Pure — no database, no model. Run it directly:
 *   node --import tsx tests/spreadsheet-import.ts
 */
import { rowToProduct, normaliseDegreeLabel } from "../src/modules/superadmin/data-extraction/lib/spreadsheet-mappers.js";
import {
  extractCourseDuration, extractCourseTaxonomy, extractStudyOptions, extractEligibility, extractEnglishTestScores, extractIntakes,
} from "../src/modules/superadmin/data-extraction/lib/agentcis-product-mappers.js";
import { repeatInstallments } from "../src/modules/superadmin/data-extraction/lib/installment-parser.js";
import { SpreadsheetCourseRowSchema, SpreadsheetImportSchema } from "../src/modules/superadmin/data-extraction/schemas/spreadsheet-import.schema.js";

let passed = 0;
let failed = 0;
function ok(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      expected ${e}\n      got      ${a}`); }
}

// "Montana State University Billings", row 1 — mapped the way the wizard auto-maps its headers.
const row = SpreadsheetCourseRowSchema.parse({
  course_name: "Bachelor of Applied Science (B.A.S.) in Applied Science",
  duration: "2 Years", intake_months: "Sep, Jan", subject_area: "Applied and Pure Science",
  degree_level: "Bachelor", min_degree_level: "High School",
  toefl: "68", ielts: "6", pte: "48",
  fee_period: "Per Semester", fee_name: "Tuition Fee", fee_installments: "4", fee_amount: "10522.08",
  fee_currency: "USD",
});
const p = rowToProduct(row, null);

console.log("\ncourse");
ok(p.name, "Bachelor of Applied Science (B.A.S.) in Applied Science", "name carried");
ok(extractCourseTaxonomy(p), { degreeLevelName: "Bachelor", subjectName: "Applied and Pure Science", areaName: "Applied and Pure Science" }, "degree level + subject area");
ok(extractCourseDuration(p).value, 2, "duration value");
ok(extractCourseDuration(p).unit, "years", "duration unit");

console.log("\nintakes");
ok(extractIntakes(p).map((i) => i.intake_month), [9, 1], "short month names → Sep=9, Jan=1");
ok(extractIntakes(p).every((i) => i.intake_year == null), true, "no year invented");

console.log("\nEnglish + eligibility");
ok(extractEnglishTestScores(p.english_test_score).map((t) => [t.test_type_name, t.overall_score]),
  [["IELTS", "6"], ["TOEFL", "68"], ["PTE", "48"]], "IELTS/TOEFL/PTE overall scores");
ok(extractEligibility(p)?.min_degree_level != null, true, "entry degree level resolved");
ok(extractEligibility(p)?.academic_tests, [], "no GRE/GMAT/SAT stated → none stored");

console.log("\nfees");
const fees = p.fees as { currency: string; feeTerms: { name: string }; fee_items: { amount: number; instalment: number }[] };
ok(fees.fee_items[0].amount * fees.fee_items[0].instalment, 42088.32, "per-semester amount × 4 semesters = course total");
ok(fees.feeTerms.name, "Per Semester", "fee period");
ok(fees.currency, "USD", "row currency wins");
ok(rowToProduct({ ...row, fee_currency: null }, "USD").fees && (rowToProduct({ ...row, fee_currency: null }, "USD").fees as { currency: string }).currency, "USD", "default currency applies");
ok(rowToProduct({ ...row, fee_amount: null }, null).fees, undefined, "no amount → no fee");

console.log("\nmessy cells");
ok(normaliseDegreeLabel("High Shool"), "High School", "'High Shool' typo (37 real rows) fixed");
ok(extractEnglishTestScores(rowToProduct({ ...row, pte: null }, null).english_test_score).map((t) => t.test_type_name),
  ["IELTS", "TOEFL"], "blank PTE (570 real rows) → no PTE requirement");
ok(SpreadsheetCourseRowSchema.parse({ ielts: 6.5, fee_amount: " 9,464 " }).ielts, "6.5", "numeric cells coerced to text");
ok(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", fee_amount: "9,464", fee_installments: "8" }), "USD").fees
  && (rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", fee_amount: "9,464", fee_installments: "8" }), "USD").fees as { fee_items: { amount: number }[] }).fee_items[0].amount,
  9464, "thousands separator in an amount");
ok(extractIntakes(rowToProduct({ ...row, intake_months: "Aug, Jan, May, Jun" }, null)).map((i) => i.intake_month), [8, 1, 5, 6], "four-month intake list");
ok(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", fee_amount: "Per Semester" }), "USD").fees, undefined, "text-only amount is not a fee of 0");

// Multi-tab template payload: extra tabs parse, unknown columns are dropped, absent tabs default to [].
const tpl = SpreadsheetImportSchema.parse({
  institution: { name: "Example University" },
  rows: [{ course_name: "BSc CS", awarding_institution: "Example University" }],
  extras: { fees: [{ courses: "BSc CS", amount: 12500, period: "Per Semester", stray: "x" }], branches: [{ name: "Boston Campus" }] },
});
ok(tpl.extras?.fees[0].amount, "12500", "template fee amount coerced to text");
ok("stray" in (tpl.extras?.fees[0] ?? {}), false, "unknown template column dropped");
ok(tpl.extras?.intakes, [], "absent template tab defaults to empty");
ok(rowToProduct(tpl.rows[0], "USD").awarding_institution, "Example University", "awarding institution passed through");

// A stated per-period rate is kept per installment — never the total re-split by the period.
ok(repeatInstallments(9464, 1, "Per Semester"), { total: 9464, installments: [{ label: "Semester 1", amount: 9464 }] }, "one semester, no count → one payment at the full rate");
ok(repeatInstallments(9464, 8, "Per Semester").installments.map((i) => i.amount), Array(8).fill(9464), "8 semesters → 8 payments of the rate");
ok(repeatInstallments(9464, 8, "Per Semester").installments[7].label, "Year 4 Semester 2", "multi-year semester labels");
ok(repeatInstallments(500, 1, "Total"), { total: 500, installments: [{ label: "Total", amount: 500 }] }, "total fee → single Total line");
const frac = repeatInstallments(10522.08, 4, "Per Semester");
ok([frac.total, frac.installments.map((i) => i.amount)], [42088.32, [10522.08, 10522.08, 10522.08, 10522.08]], "fractional rate: cents are kept in the total and every payment");
ok(Math.round(frac.installments.reduce((n, i) => n + i.amount, 0) * 100), 4208832, "…and the payments sum to the stored total to the cent");
const fracCount = repeatInstallments(1000, 2.6, "Per Semester");
ok([fracCount.total, fracCount.installments.length], [3000, 3], "fractional count: one rounded count for both total and payments");
// English cells: one number = overall; comma list = Overall, Listening, Reading, Writing, Speaking.
const bands = extractEnglishTestScores(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", ielts: "6.5, 6, 6.5, 6, 5.5", pte: "58" }), null).english_test_score);
ok(bands.find((b) => b.test_type_name === "IELTS"), { test_type_name: "IELTS", overall_score: "6.5", listening_score: "6", reading_score: "6.5", writing_score: "6", speaking_score: "5.5" }, "IELTS bands from a comma list");
ok(bands.find((b) => b.test_type_name === "PTE")?.overall_score, "58", "single number is overall only");
ok(bands.find((b) => b.test_type_name === "PTE")?.listening_score, null, "unstated bands stay null");

// Domestic + international tuition and an application fee on one row — three lines, each its own.
const fees3 = rowToProduct(SpreadsheetCourseRowSchema.parse({
  course_name: "X", fee_name: "Tuition Fee", fee_period: "Per Semester", fee_installments: "8",
  fee_amount: "9464", domestic_fee_amount: "7000",
  application_fee_name: "Application Fee", application_fee_period: "Total", application_fee_installments: "1", application_fee_amount: "50",
}), "USD").fees as { feeTerms: { name: string }; fee_items: Record<string, unknown>[] };
ok(fees3.fee_items.map((i) => [i.student_type, i.amount, i.instalment, i.period ?? fees3.feeTerms.name]),
  [["international", 9464, 8, "Per Semester"], ["domestic", 7000, 8, "Per Semester"], ["both", 50, 1, "Total"]],
  "international, domestic and application fee lines");
ok((rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", branch_names: "Main Campus, City Campus; Online" }), null).branches),
  [{ name: "Main Campus" }, { name: "City Campus" }, { name: "Online" }], "branch names split on , and ;");

// Intake cells with years / days (the sheet's "Intake Month (2026/2027)" column).
const ik = (v: string) => extractIntakes(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", intake_months: v }), null))
  .map((i) => [i.intake_month, i.intake_year, i.start_date]);
ok(ik("Sep 26, Jan 27, Mar 28, Jun 29"), [[9, 2026, null], [1, 2027, null], [3, 2028, null], [6, 2029, null]], "month + 2-digit year");
ok(ik("1 Sep 26, 7 Jan 27, Mar, Jun"), [[9, 2026, "2026-09-01"], [1, 2027, "2027-01-07"], [3, null, null], [6, null, null]], "day + month + year → start date; bare months kept");
ok(ik("Sep, Jan, Mar, Jun"), [[9, null, null], [1, null, null], [3, null, null], [6, null, null]], "plain months");
// Duration cell holding a whole study option.
const opt = rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "On Campus, Full Time, 4 Years, Both" }), null);
ok([opt.duration, opt.study_mode, opt.study_load], ["4 Years", "On Campus", "Full Time"], "combined duration cell split");
ok(extractCourseDuration(opt), { value: 4, unit: "years" }, "duration still reads 4 years");
ok(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "4 Years" }), null).duration, "4 Years", "plain duration unchanged");
const remote = rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "Remote, Full Time, 4 Years" }), null);
ok([remote.duration, remote.study_mode], ["4 Years", "Remote"], "any mode the course writer reads (Remote) is a mode");
const embedded = rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "4 Years Online" }), null);
ok([embedded.duration, embedded.study_mode], ["4 Years Online", "online"], "a mode word inside a length keeps the duration");
ok(extractStudyOptions(embedded).map((o) => [o.study_mode, o.duration_value]), [["online", 4]], "…and the course writer reads it as online");
ok(extractStudyOptions(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "4 Years at City Campus, Online" }), null)).map((o) => o.study_mode),
  ["online"], "a campus named in the location is not a mode");
ok(extractStudyOptions(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "4 Years Online, In Person" }), null)).map((o) => o.study_mode),
  ["on_campus", "online"], "an embedded mode is kept beside an explicit one");
ok(extractStudyOptions(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", duration: "4 Years Online, Online" }), null)).map((o) => o.study_mode),
  ["online"], "the same mode twice is one option");
ok(repeatInstallments(100, 1e9, "Per Month").installments.length, 1, "an absurd installment count collapses to one Total line");
ok(repeatInstallments(100, 12, "Per Month").installments.length, 12, "a real count still repeats");
ok(rowToProduct(SpreadsheetCourseRowSchema.parse({ course_name: "X", branch_names: "Main   Campus; City\tCampus" }), null).branches,
  [{ name: "Main Campus" }, { name: "City Campus" }], "branch names collapse inner spaces (same key as stageBranches)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
