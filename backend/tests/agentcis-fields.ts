/**
 * AgentCIS product field mapping — subject/degree-level taxonomy, entry-requirement eligibility,
 * English/academic test scores, and intake months.
 *
 * All four used to read fields that don't exist on the real AgentCIS payload (reconstructed from
 * agentcis-app's own sync-job code, then confirmed live against
 * https://api.superadmin.agentcis.com/partner-product-database/search):
 *   - degree_level/subject_area live under `subject_area_and_level`, not top-level p.degree_level.
 *   - entry requirement lives under `academic_requirement.degree_level`/`.academic_score`, not
 *     `.qualification_type`/`.min_score`.
 *   - english_test_score/other_test_score were never read at all.
 *   - `intake_month` is an array of recurring month names with no year; being present at all used
 *     to make extractIntakes treat the WHOLE PRODUCT as one intake, naming it after the product's
 *     own `name`.
 *
 * FIXTURE is the real "Bachelor of Business" product from Victoria University (ECA), pulled live
 * from the AgentCIS search endpoint on 2026-09-11 (institution id 2704, product id 115870) — not
 * synthesized, to keep this test anchored to what the source actually sends.
 *
 * Pure — no database, no model. Run it directly:
 *   node --import tsx tests/agentcis-fields.ts
 */
import {
  extractCourseTaxonomy, extractEligibility,
  extractEnglishTestScores, extractIntakes, extractStudyOptions,
} from "../src/modules/superadmin/data-extraction/lib/agentcis-product-mappers.js";
import { degreeLevelName } from "../src/modules/superadmin/data-extraction/lib/agentcis-mappers.js";

let passed = 0;
let failed = 0;

function ok(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${e}, got ${a}`); }
}

const BACHELOR_OF_BUSINESS = {
  id: 115870,
  name: "Bachelor of Business",
  intake_month: [
    { id: 1, value: "February" }, { id: 3, value: "April" }, { id: 8, value: "September" },
    { id: 6, value: "July" }, { id: 9, value: "October" },
  ],
  duration: "3 Years",
  academic_requirement: { degree_level: { id: 3, name: "High School" }, academic_score: null, academic_score_type: null },
  english_test_score: {
    PTE: { Overall: 57, Reading: null, Writing: null, Speaking: null, Listening: null },
    IELTS: { Overall: 6, Reading: null, Writing: null, Speaking: null, Listening: null },
    TOEFL: { Overall: 67, Reading: null, Writing: null, Speaking: null, Listening: null },
  },
  other_test_score: { GRE: null, GMAT: null, "SAT I": null, "SAT II": null },
  fees: {
    name: "Default Fee", country: "All Countries", feeTerms: { id: 6, name: "Per Semester" },
    fee_items: [{ amount: "16700", fee_type: { id: 28, name: "Tuition Fee" }, totalFee: 0, instalment: 6, inQuotation: true }],
  },
  subject_area_and_level: {
    subject: { id: 31, name: "Business Studies" },
    degree_level: { id: 7, name: "Bachelor" },
    subject_area: { id: 4, name: "Business and Management" },
  },
};

// ── Taxonomy ──
const tax = extractCourseTaxonomy(BACHELOR_OF_BUSINESS);
ok(tax.degreeLevelName, "Bachelor", "taxonomy: degreeLevelName");
ok(tax.subjectName, "Business Studies", "taxonomy: subjectName");
ok(tax.areaName, "Business and Management", "taxonomy: areaName");
ok(extractCourseTaxonomy({}).degreeLevelName, null, "taxonomy: absent subject_area_and_level -> null");

// ── Duration (regression: already fixed, re-checked against this real product) ──
ok(extractStudyOptions(BACHELOR_OF_BUSINESS)[0].duration_value, 3, "duration: '3 Years' -> value 3");
ok(extractStudyOptions(BACHELOR_OF_BUSINESS)[0].duration_unit, "years", "duration: '3 Years' -> unit years");

// ── Degree level name (the admin Eligibility tab looks this field up BY NAME; a stored slug
// renders the Min Degree Level control as if nothing were set at all) ──
ok(degreeLevelName("certificate"), "Certificate", "degreeLevelName: certificate -> Certificate");
ok(degreeLevelName("graduate_diploma"), "Graduate Diploma", "degreeLevelName: graduate_diploma -> Graduate Diploma");
ok(degreeLevelName("doctoral"), "PHD", "degreeLevelName: doctoral -> PHD");
ok(degreeLevelName(null), null, "degreeLevelName: null -> null");

// ── Eligibility (entry requirement) ──
const elig = extractEligibility(BACHELOR_OF_BUSINESS)!;
ok(elig.min_degree_level, "Certificate", "eligibility: High School -> Certificate (name, not slug)");
ok(elig.score_value, null, "eligibility: no academic_score stated -> null (not fabricated)");
ok(elig.academic_tests, [], "eligibility: all other_test_score entries null -> no academic tests");

// A product that DOES state a score/type and other-test scores.
const withScore = extractEligibility({
  academic_requirement: { degree_level: { name: "Bachelor" }, academic_score: "65", academic_score_type: "percentage" },
  other_test_score: { GRE: 310, GMAT: null, "SAT I": "1200" },
})!;
ok(withScore.min_degree_level, "Bachelor", "eligibility: Bachelor -> Bachelor (name, not slug)");
ok(withScore.score_type, "percentage", "eligibility: academic_score_type 'percentage' passthrough");
ok(withScore.score_value, 65, "eligibility: academic_score '65' -> 65");
ok(withScore.academic_tests, [{ test_name: "GRE", score: "310" }, { test_name: "SAT I", score: "1200" }], "eligibility: other_test_score -> academic_tests (nulls dropped)");

const gpaCase = extractEligibility({
  academic_requirement: { degree_level: null, academic_score: "3.2", academic_score_type: "GPA" },
})!;
ok(gpaCase.score_type, "gpa_4", "eligibility: academic_score_type 'GPA' -> gpa_4");

ok(extractEligibility({ academic_requirement: { degree_level: null, academic_score: null, academic_score_type: null } }), null, "eligibility: nothing stated -> null, not an empty row");

// ── English test scores ──
const eng = extractEnglishTestScores(BACHELOR_OF_BUSINESS.english_test_score);
ok(eng.length, 3, "english: 3 tests with an overall score (PTE/IELTS/TOEFL)");
ok(eng.find((t) => t.test_type_name === "IELTS")?.overall_score, "6", "english: IELTS overall '6'");
ok(eng.find((t) => t.test_type_name === "IELTS")?.listening_score, null, "english: IELTS listening null (not stated)");
ok(extractEnglishTestScores({ IELTS: { Overall: null, Reading: null, Writing: null, Speaking: null, Listening: null } }), [], "english: a test with every band null is dropped");
ok(extractEnglishTestScores(null), [], "english: absent english_test_score -> []");

// ── Intakes ──
const intakes = extractIntakes(BACHELOR_OF_BUSINESS);
ok(intakes.length, 5, "intakes: 5 recurring months");
ok(intakes.map((i) => i.intake_name), ["February", "April", "September", "July", "October"], "intakes: names are the month values, not the course name");
ok(intakes.every((i) => i.intake_year === null), true, "intakes: no year stated by AgentCIS -> year null, not guessed");
ok(intakes.find((i) => i.intake_name === "September")?.intake_month, 9, "intakes: month name resolved to number");
ok(extractIntakes({ name: "Some Course", intake_month: [] }), [], "intakes: empty intake_month -> [] (not the whole product as a fake intake)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
