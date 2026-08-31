/**
 * Eligibility tests — the pure evaluator (no DB) plus the course-vs-institution requirement
 * resolution against the real dev DB.
 * Run: node --import tsx tests/enquiries/eligibility.ts
 *
 * Covers:
 *  1-3.   Degree ladder: below / equal / above the required rank.
 *  4-5.   Unrecognised degree on either side → unknown, never fail.
 *  6-8.   Score comparison: same scale, converted scale, non-numeric grading system.
 *  9.     Unparseable requirement score contributes no criterion at all.
 *  10-11. Language: overall bar and per-band bar, including the column↔jsonb key mapping.
 *  12.    A missing test is unknown, not fail.
 *  13.    Rollup precedence — one fail outranks any number of passes.
 *  14.    Multiple requirement rows are alternative pathways; the best one wins.
 *  15.    No requirements at all → unknown with no criteria.
 *  15b.   The percentage counts only comparable criteria — unknowns are excluded from BOTH
 *         halves of the fraction, so a thin profile never scores against the student.
 *  16.    English-only course still yields a verdict.
 *  17.    Course-assigned requirements win over institution-level ones.
 *  18.    Institution-level requirements apply when the course names none.
 *  19.    applicable_to filters by the derived student type.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import {
  evaluateEligibility,
  parseScore,
  type EligibilityRequirementRow,
  type EnglishRequirementRow,
  type StudentEligibilitySnapshot,
} from "../../src/modules/enquiries/shared/eligibility.js";
import * as repo from "../../src/modules/enquiries/repositories/eligibility.repository.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// The real seeded ladder (degree_levels_seeder), keyed the way loadDegreeLadder keys it.
const LADDER = new Map<string, number>([
  ["certificate", 1],
  ["diploma", 2],
  ["associatedegree", 3],
  ["associate", 3],
  ["bachelors", 4],
  ["bachelor", 4],
  ["graduatecertificate", 5],
  ["graduatediploma", 6],
  ["masters", 7],
  ["master", 7],
  ["doctoralphd", 8],
  ["doctoral", 8],
]);

function req(over: Partial<EligibilityRequirementRow> = {}): EligibilityRequirementRow {
  return {
    id: over.id ?? "req-1",
    name: null,
    applicable_to: "both",
    min_degree_level: null,
    min_score_percent: null,
    min_score_grade: null,
    score_type: null,
    min_score: null,
    description: null,
    academic_tests: null,
    language_tests: null,
    ...over,
  };
}

function student(over: Partial<StudentEligibilitySnapshot> = {}): StudentEligibilitySnapshot {
  return { qualifications: [], languageTests: [], academicTests: [], ...over };
}

function evaluate(
  requirements: EligibilityRequirementRow[],
  s: StudentEligibilitySnapshot,
  englishRequirements: EnglishRequirementRow[] = [],
) {
  return evaluateEligibility({
    requirements,
    englishRequirements,
    degreeLadder: LADDER,
    student: s,
    studentType: "international",
  });
}

const qual = (type: string, system?: string, grade?: string) => ({
  qualification_type: type,
  grading_system: system ?? null,
  grade_value: grade ?? null,
  end_date: "2024-01-01",
});

const english = (over: Partial<EnglishRequirementRow> = {}): EnglishRequirementRow => ({
  id: "eng-1",
  test_type_name: "IELTS Academic",
  overall_score: null,
  listening_score: null,
  reading_score: null,
  writing_score: null,
  speaking_score: null,
  ...over,
});

// ── DB fixtures for the resolution tests ──

async function makeJobCourse(): Promise<{ jobId: string; courseId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_name: `Elig Test ${suffix}`, status: "exported" })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Elig Course ${suffix}`, country_code: "AU" })
    .returning("id");
  return { jobId: job.id, courseId: course.id };
}

async function makeRequirement(jobId: string, over: Record<string, unknown> = {}): Promise<string> {
  const [row] = await masterKnex("superadmin.extraction_eligibility_requirements")
    .insert({ job_id: jobId, applicable_to: "both", ...over })
    .returning("id");
  return row.id;
}

async function assignRequirement(jobId: string, courseId: string, requirementId: string) {
  await masterKnex("superadmin.extraction_course_eligibility_assignments").insert({
    job_id: jobId,
    course_id: courseId,
    eligibility_requirement_id: requirementId,
  });
}

async function cleanupJob(jobId: string) {
  // Assignments, requirements and courses all CASCADE from the job.
  await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
}

async function main() {
  console.log("Eligibility tests\n");

  // ── Pure evaluator ──

  await assert("degree below the required rank fails", () => {
    const v = evaluate([req({ min_degree_level: "Master's" })], student({ qualifications: [qual("bachelor")] }));
    eq(v.status, "not_eligible");
    eq(v.criteria[0].status, "fail");
  });

  await assert("degree equal to the required rank passes", () => {
    const v = evaluate([req({ min_degree_level: "Bachelor's" })], student({ qualifications: [qual("bachelor")] }));
    eq(v.status, "eligible");
  });

  await assert("degree above the required rank passes", () => {
    const v = evaluate([req({ min_degree_level: "Bachelor's" })], student({ qualifications: [qual("master")] }));
    eq(v.status, "eligible");
    eq(v.criteria[0].actual, "master");
  });

  await assert("unrecognised required degree is unknown, not fail", () => {
    const v = evaluate([req({ min_degree_level: "Advanced Wizardry" })], student({ qualifications: [qual("master")] }));
    eq(v.criteria[0].status, "unknown");
    eq(v.status, "unknown");
  });

  await assert("student with no qualifications is unknown, not fail", () => {
    const v = evaluate([req({ min_degree_level: "Bachelor's" })], student());
    eq(v.criteria[0].status, "unknown");
    eq(v.criteria[0].actual, null);
  });

  await assert("same-scale score comparison is not marked converted", () => {
    const v = evaluate(
      [req({ score_type: "percentage", min_score: "60" })],
      student({ qualifications: [qual("bachelor", "percentage", "72")] }),
    );
    eq(v.criteria[0].status, "pass");
    eq(v.criteria[0].converted, false);
  });

  await assert("cross-scale score converts: gpa_4 3.4 clears 60%", () => {
    const v = evaluate(
      [req({ min_score_percent: "60" })],
      student({ qualifications: [qual("bachelor", "gpa_4", "3.4")] }),
    );
    eq(v.criteria[0].status, "pass", "3.4/4 = 85%");
    eq(v.criteria[0].converted, true);
  });

  await assert("cross-scale score converts and can fail: gpa_4 2.0 misses 60%", () => {
    const v = evaluate(
      [req({ min_score_percent: "60" })],
      student({ qualifications: [qual("bachelor", "gpa_4", "2.0")] }),
    );
    eq(v.criteria[0].status, "fail", "2.0/4 = 50%");
  });

  await assert("letter_grade has no numeric meaning → unknown", () => {
    const v = evaluate(
      [req({ min_score_percent: "60" })],
      student({ qualifications: [qual("bachelor", "letter_grade", "B")] }),
    );
    eq(v.criteria[0].status, "unknown");
  });

  await assert("unparseable requirement score contributes no criterion", () => {
    const v = evaluate(
      [req({ min_score_grade: "Credit" })],
      student({ qualifications: [qual("bachelor", "percentage", "72")] }),
    );
    eq(v.criteria.length, 0, "min_score_grade carries no number");
    eq(v.status, "unknown");
  });

  await assert("english overall bar compares against the student's test", () => {
    const v = evaluate([], student({ languageTests: [{ test_type: "IELTS", overall_score: "6.5", sub_scores: null }] }), [
      english({ overall_score: "6.0" }),
    ]);
    eq(v.status, "eligible");
    eq(v.criteria[0].status, "pass", "'IELTS' matches 'IELTS Academic'");
  });

  await assert("per-band bar maps the requirement column to the student's sub_scores key", () => {
    const v = evaluate(
      [],
      student({ languageTests: [{ test_type: "IELTS", overall_score: "6.5", sub_scores: { Writing: "5.0" } }] }),
      [english({ overall_score: "6.0", writing_score: "6.0" })],
    );
    const writing = v.criteria.find((c) => c.label.includes("Writing"));
    eq(writing?.status, "fail", "5.0 writing misses the 6.0 band");
    eq(v.status, "not_eligible");
  });

  await assert("missing language test is unknown, not fail", () => {
    const v = evaluate([], student(), [english({ overall_score: "6.0" })]);
    eq(v.criteria[0].status, "unknown");
    eq(v.status, "unknown");
  });

  await assert("one fail outranks any number of passes", () => {
    const v = evaluate(
      [req({ min_degree_level: "Bachelor's", min_score_percent: "90" })],
      student({ qualifications: [qual("master", "percentage", "70")] }),
    );
    eq(v.criteria.find((c) => c.key === "min_degree")?.status, "pass");
    eq(v.criteria.find((c) => c.key === "min_score")?.status, "fail");
    eq(v.status, "not_eligible");
  });

  await assert("alternative pathways: the passing row wins", () => {
    const v = evaluate(
      [
        req({ id: "hard", min_degree_level: "Master's" }),
        req({ id: "easy", min_degree_level: "Diploma" }),
      ],
      student({ qualifications: [qual("bachelor")] }),
    );
    eq(v.status, "eligible");
    eq(v.requirement_id, "easy");
  });

  await assert("no requirements at all → unknown with no criteria", () => {
    const v = evaluate([], student({ qualifications: [qual("master")] }));
    eq(v.status, "unknown");
    eq(v.criteria.length, 0);
    eq(v.requirement_id, null);
    eq(v.percentage, null);
  });

  await assert("percentage is the share of comparable criteria that passed", () => {
    // Degree passes, score fails -> 1 of 2.
    const v = evaluate(
      [req({ min_degree_level: "Bachelor's", min_score_percent: "90" })],
      student({ qualifications: [qual("master", "percentage", "70")] }),
    );
    eq(v.percentage, 50);
    eq(v.status, "not_eligible", "the number does not change the verdict");
  });

  await assert("unknown criteria are excluded from BOTH halves of the fraction", () => {
    // Degree passes; the language bar cannot be checked at all. 1 of 1, not 1 of 2 -- a missing
    // test score means "we checked less", never "you scored badly".
    const v = evaluate(
      [req({ min_degree_level: "Bachelor's" })],
      student({ qualifications: [qual("master")] }),
      [english({ overall_score: "6.0" })],
    );
    eq(v.criteria.length, 2, "both criteria are still listed");
    eq(v.criteria.filter((c) => c.status === "unknown").length, 1);
    eq(v.percentage, 100);
  });

  await assert("nothing comparable → percentage is null, not zero", () => {
    const v = evaluate([req({ min_degree_level: "Bachelor's" })], student());
    eq(v.status, "unknown");
    eq(v.percentage, null, "0% would read as a failing grade for an empty profile");
  });

  await assert("meeting nothing comparable scores 0, and still is not an error", () => {
    const v = evaluate(
      [req({ min_degree_level: "Master's" })],
      student({ qualifications: [qual("diploma")] }),
    );
    eq(v.percentage, 0);
    eq(v.status, "not_eligible");
  });

  await assert("among equally-ranked pathways the higher percentage is the one reported", () => {
    // Both pathways fail on the degree, so both are not_eligible; the second also passes a score
    // check, so it is the closer fit and the one worth showing.
    const v = evaluate(
      [
        req({ id: "bare", min_degree_level: "Master's" }),
        req({ id: "closer", min_degree_level: "Master's", min_score_percent: "60" }),
      ],
      student({ qualifications: [qual("diploma", "percentage", "72")] }),
    );
    eq(v.status, "not_eligible");
    eq(v.requirement_id, "closer");
    eq(v.percentage, 50);
  });

  await assert("parseScore reads the first number out of free text", () => {
    eq(parseScore("6.0-6.5"), 6);
    eq(parseScore("6.5 overall"), 6.5);
    eq(parseScore("Credit"), null);
    eq(parseScore(""), null);
    eq(parseScore(null), null);
  });

  // ── Requirement resolution against the real DB ──

  await assert("course-assigned requirements win over institution-level ones", async () => {
    const { jobId, courseId } = await makeJobCourse();
    try {
      await makeRequirement(jobId, { min_degree_level: "Master's" }); // institution-level, unassigned
      const scoped = await makeRequirement(jobId, { min_degree_level: "Diploma" });
      await assignRequirement(jobId, courseId, scoped);

      const rows = await repo.findRequirementsForCourse(courseId, jobId);
      eq(rows.length, 1, "only the course-assigned row");
      eq(rows[0].min_degree_level, "Diploma");
    } finally {
      await cleanupJob(jobId);
    }
  });

  await assert("institution-level requirements apply when the course names none", async () => {
    const { jobId, courseId } = await makeJobCourse();
    try {
      await makeRequirement(jobId, { min_degree_level: "Master's" });
      const rows = await repo.findRequirementsForCourse(courseId, jobId);
      eq(rows.length, 1);
      eq(rows[0].min_degree_level, "Master's");
    } finally {
      await cleanupJob(jobId);
    }
  });

  await assert("english requirements follow the same course-first rule", async () => {
    const { jobId, courseId } = await makeJobCourse();
    try {
      await masterKnex("superadmin.extraction_english_requirements").insert({
        job_id: jobId,
        course_id: null,
        test_type_name: "IELTS Academic",
        overall_score: "6.0",
      });
      let rows = await repo.findEnglishRequirementsForCourse(courseId, jobId);
      eq(rows.length, 1, "institution-level row used when the course has none");
      eq(rows[0].overall_score, "6.0");

      await masterKnex("superadmin.extraction_english_requirements").insert({
        job_id: jobId,
        course_id: courseId,
        test_type_name: "IELTS Academic",
        overall_score: "7.0",
      });
      rows = await repo.findEnglishRequirementsForCourse(courseId, jobId);
      eq(rows.length, 1, "course row shadows the institution one");
      eq(rows[0].overall_score, "7.0");
    } finally {
      await cleanupJob(jobId);
    }
  });

  await assert("the seeded degree ladder is loadable and ordered", async () => {
    const ladder = await repo.loadDegreeLadder();
    const bachelor = ladder.get("bachelor");
    const master = ladder.get("master");
    if (bachelor == null || master == null) throw new Error("bachelor/master missing from the ladder");
    if (!(master > bachelor)) throw new Error(`master (${master}) should outrank bachelor (${bachelor})`);
    // The requirement side stores the NAME, the student side the SLUG — both must resolve.
    eq(ladder.get("bachelors"), bachelor, "\"Bachelor's\" and \"bachelor\" are the same rank");
    eq(ladder.get("other"), undefined, "'other' is a bucket, not a rank");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
