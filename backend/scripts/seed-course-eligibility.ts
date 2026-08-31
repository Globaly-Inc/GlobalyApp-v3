// Test data — entry requirements for every course on an extraction job, so the eligibility
// evaluator has something real to evaluate.
//
//   node --import tsx scripts/seed-course-eligibility.ts [jobId] [studentUserId]
//
// Pass a studentUserId and it runs getVerdict() against every seeded course afterwards and
// prints what the student would see — seed and check in one command.
//
// Idempotent and non-destructive: every row it writes is tagged (requirement `name` starts with
// SEED_TAG, English rows carry SEED_MARKER in source_url) and only tagged rows are deleted on a
// re-run, so scraped requirements are never touched.
//
// The shape of the data is deliberately uneven, because a uniform seed only ever tests one
// branch. Across the job you get: gpa_4 and percentage score scales, academic tests, per-band
// English minimums, two alternative entry pathways on one course, a domestic-only row that an
// international student must never see, and one course left with no rows of its own so the
// institution-level fallback is exercised too.

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { getVerdict } from "../src/modules/enquiries/services/eligibility.service.js";

const S = "superadmin";
const JOB_ID = process.argv[2] ?? "581470db-d3d0-4516-891f-bd4d9b6f6e69";
const STUDENT_ID = process.argv[3] ? Number(process.argv[3]) : null;

const SEED_TAG = "[seed] ";
const SEED_MARKER = "seed:course-eligibility";

interface Profile {
  minDegree: string;
  /** score_type + min_score is the newer pair; minScorePercent is the legacy percentage column. */
  scoreType?: "gpa_4" | "percentage";
  minScore?: number;
  minScorePercent?: number;
  academicTests: { test_name: string; score: string }[];
  english: { overall: string; band: string };
  /** A second, easier route in — the verdict must report the pathway the student does best on. */
  alternative?: { minDegree: string; minScorePercent: number };
}

// extraction_courses.degree_level, lowercased. Anything unmapped (Certificate, Other) takes the
// default. min_degree_level values are public.degree_levels.name — that is what the extraction
// admin form writes, and what the ladder in eligibility.repository resolves.
const BY_DEGREE: Record<string, Profile> = {
  doctorate: {
    minDegree: "Master's",
    scoreType: "gpa_4",
    minScore: 3.5,
    academicTests: [{ test_name: "GRE", score: "320" }],
    english: { overall: "7.0", band: "6.5" },
  },
  master: {
    minDegree: "Bachelor's",
    scoreType: "gpa_4",
    minScore: 3.0,
    academicTests: [{ test_name: "GRE", score: "300" }],
    english: { overall: "6.5", band: "6.0" },
    alternative: { minDegree: "Graduate Diploma", minScorePercent: 65 },
  },
  bachelor: {
    minDegree: "Certificate",
    minScorePercent: 60,
    academicTests: [{ test_name: "SAT", score: "1200" }],
    english: { overall: "6.0", band: "5.5" },
  },
};

const DEFAULT_PROFILE: Profile = {
  minDegree: "Certificate",
  minScorePercent: 50,
  academicTests: [],
  english: { overall: "5.5", band: "5.0" },
};

async function insertRequirement(row: Record<string, unknown>): Promise<string> {
  const [inserted] = await masterKnex(`${S}.extraction_eligibility_requirements`)
    .insert({ job_id: JOB_ID, ...row })
    .returning("id");
  return inserted.id as string;
}

async function assign(courseId: string, requirementId: string): Promise<void> {
  await masterKnex(`${S}.extraction_course_eligibility_assignments`).insert({
    job_id: JOB_ID,
    course_id: courseId,
    eligibility_requirement_id: requirementId,
  });
}

async function insertEnglish(courseId: string | null, english: Profile["english"]): Promise<void> {
  await masterKnex(`${S}.extraction_english_requirements`).insert({
    job_id: JOB_ID,
    course_id: courseId,
    test_type_name: "IELTS",
    overall_score: english.overall,
    listening_score: english.band,
    reading_score: english.band,
    writing_score: english.band,
    speaking_score: english.band,
    source_url: SEED_MARKER,
  });
}

async function main() {
  const courses: { id: string; name: string; degree_level: string | null }[] = await masterKnex(
    `${S}.extraction_courses`,
  )
    .where({ job_id: JOB_ID })
    .orderBy("name")
    .select("id", "name", "degree_level");

  if (courses.length === 0) {
    console.error(`No courses on job ${JOB_ID}. Check the job id.`);
    await masterKnex.destroy();
    process.exit(1);
  }

  // Wipe only what a previous run of THIS script wrote. Assignments go with their requirement
  // (ON DELETE CASCADE on extraction_course_eligibility_assignments).
  const droppedReqs = await masterKnex(`${S}.extraction_eligibility_requirements`)
    .where({ job_id: JOB_ID })
    .where("name", "like", `${SEED_TAG}%`)
    .del();
  const droppedEnglish = await masterKnex(`${S}.extraction_english_requirements`)
    .where({ job_id: JOB_ID, source_url: SEED_MARKER })
    .del();
  console.log(`Cleared ${droppedReqs} seeded requirement(s) and ${droppedEnglish} seeded English row(s).\n`);

  // Institution-level rows: job-scoped, assigned to no course, English row with a null course_id.
  // Only reachable by a course that names no requirements of its own.
  const institutionReqId = await insertRequirement({
    name: `${SEED_TAG}Institution-wide entry requirement`,
    applicable_to: "both",
    min_degree_level: "Bachelor's",
    min_score_percent: 55,
    description: "Applies to any course at this institution that does not state its own.",
    academic_tests: JSON.stringify([]),
    language_tests: JSON.stringify([]),
  });
  await insertEnglish(null, { overall: "6.0", band: "5.5" });

  // One course deliberately left bare, so both fallbacks (academic + English) are exercised.
  const fallbackCourse = courses.at(-1)!;
  const seeded: { course: string; rows: string[] }[] = [];

  for (const [index, course] of courses.entries()) {
    if (course.id === fallbackCourse.id) continue;

    const profile = BY_DEGREE[(course.degree_level ?? "").toLowerCase()] ?? DEFAULT_PROFILE;
    const rows: string[] = [];

    const primaryId = await insertRequirement({
      name: `${SEED_TAG}Standard entry`,
      applicable_to: "both",
      min_degree_level: profile.minDegree,
      score_type: profile.scoreType ?? null,
      min_score: profile.minScore ?? null,
      min_score_percent: profile.minScorePercent ?? null,
      description: `Standard entry for ${course.name}.`,
      academic_tests: JSON.stringify(profile.academicTests),
      language_tests: JSON.stringify([]),
    });
    await assign(course.id, primaryId);
    rows.push(
      `standard: ${profile.minDegree}` +
        (profile.minScore != null ? ` + ${profile.minScore} ${profile.scoreType}` : ` + ${profile.minScorePercent}%`) +
        (profile.academicTests.length ? ` + ${profile.academicTests[0]!.test_name}` : ""),
    );

    if (profile.alternative) {
      const altId = await insertRequirement({
        name: `${SEED_TAG}Alternative pathway`,
        applicable_to: "both",
        min_degree_level: profile.alternative.minDegree,
        min_score_percent: profile.alternative.minScorePercent,
        description: "Alternative entry pathway — the student needs to satisfy either route, not both.",
        academic_tests: JSON.stringify([]),
        language_tests: JSON.stringify([]),
      });
      await assign(course.id, altId);
      rows.push(`alternative: ${profile.alternative.minDegree} + ${profile.alternative.minScorePercent}%`);
    }

    // Every third course also carries a domestic-only row. An international student must never
    // see it — that filter lives in eligibility.service.resolveStudentType.
    if (index % 3 === 0) {
      const domesticId = await insertRequirement({
        name: `${SEED_TAG}Domestic entry`,
        applicable_to: "domestic",
        min_degree_level: profile.minDegree,
        min_score_percent: 75,
        description: "Domestic applicants only.",
        academic_tests: JSON.stringify([]),
        language_tests: JSON.stringify([]),
      });
      await assign(course.id, domesticId);
      rows.push("domestic-only: 75% (international students must not see this)");
    }

    await insertEnglish(course.id, profile.english);
    rows.push(`IELTS ${profile.english.overall} overall, ${profile.english.band} per band`);

    seeded.push({ course: `${course.name} [${course.degree_level ?? "?"}]`, rows });
  }

  for (const s of seeded) {
    console.log(s.course);
    for (const r of s.rows) console.log(`   · ${r}`);
  }
  console.log(`\n${fallbackCourse.name} — left with NO rows of its own on purpose;`);
  console.log(`   it must inherit the institution-wide requirement (${institutionReqId}) and IELTS 6.0.\n`);

  if (STUDENT_ID) {
    console.log(`Verdicts for platform user ${STUDENT_ID}:\n`);
    for (const course of courses) {
      try {
        const v = await getVerdict(STUDENT_ID, course.id);
        const pct = v.percentage == null ? "  -" : `${String(v.percentage).padStart(3)}%`;
        console.log(`${pct}  ${v.status.padEnd(12)} ${v.student_type.padEnd(13)} ${course.name}`);
        for (const c of v.criteria) {
          console.log(`         ${c.status.padEnd(8)} ${c.label}: need ${c.required ?? "—"}, has ${c.actual ?? "—"}`);
        }
      } catch (err) {
        console.log(`   FAILED  ${course.name}: ${(err as Error).message}`);
      }
    }
  } else {
    console.log("Pass a platform user id as the second argument to print the verdicts too.");
  }

  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("seed failed:", err);
  await masterKnex.destroy();
  process.exit(1);
});
