// Both sides of the eligibility comparison. Requirements live in the superadmin schema
// (scraped), the student's profile in globalyapp — one pool, explicit schema prefixes.

import { masterKnex } from "../../../core/db/master-pool.js";
import type {
  EligibilityRequirementRow,
  EnglishRequirementRow,
  StudentEligibilitySnapshot,
} from "../shared/eligibility.js";

const S = "superadmin";

const REQUIREMENT_COLUMNS = [
  "er.id",
  "er.name",
  "er.applicable_to",
  "er.min_degree_level",
  "er.min_score_percent",
  "er.min_score_grade",
  "er.score_type",
  "er.min_score",
  "er.description",
  "er.academic_tests",
  "er.language_tests",
];

export async function findCourse(courseId: string) {
  return masterKnex(`${S}.extraction_courses`)
    .where({ id: courseId })
    .first("id", "job_id", "name", "country_code");
}

/**
 * Entry requirements for a course.
 *
 * Course-assigned rows win. Institution-level rows — job-scoped requirements assigned to no
 * course at all — apply only when the course names none of its own, which is how the extraction
 * admin expresses "this applies across the institution". A course with its own rows is fully
 * specified and must not silently inherit the institution's on top.
 */
export async function findRequirementsForCourse(
  courseId: string,
  jobId: string | null,
): Promise<EligibilityRequirementRow[]> {
  const assigned = await masterKnex(`${S}.extraction_course_eligibility_assignments as a`)
    .join(`${S}.extraction_eligibility_requirements as er`, "er.id", "a.eligibility_requirement_id")
    .where("a.course_id", courseId)
    .select(REQUIREMENT_COLUMNS);
  if (assigned.length > 0 || !jobId) return assigned as EligibilityRequirementRow[];

  return masterKnex(`${S}.extraction_eligibility_requirements as er`)
    .where("er.job_id", jobId)
    .whereNotExists(
      masterKnex(`${S}.extraction_course_eligibility_assignments as a`).whereRaw(
        "a.eligibility_requirement_id = er.id",
      ),
    )
    .select(REQUIREMENT_COLUMNS) as Promise<EligibilityRequirementRow[]>;
}

/**
 * The English bar. Same course-first, institution-second rule as above — but expressed with a
 * direct nullable `course_id` rather than a junction, so `course_id IS NULL` is what makes a row
 * institution-wide.
 */
export async function findEnglishRequirementsForCourse(
  courseId: string,
  jobId: string | null,
): Promise<EnglishRequirementRow[]> {
  const scoped = await masterKnex(`${S}.extraction_english_requirements`).where({ course_id: courseId });
  if (scoped.length > 0 || !jobId) return scoped as EnglishRequirementRow[];

  return masterKnex(`${S}.extraction_english_requirements`)
    .where({ job_id: jobId })
    .whereNull("course_id") as unknown as Promise<EnglishRequirementRow[]>;
}

/**
 * The student's side.
 *
 * Deliberately reads the child tables, NOT the flat `platform_user_profiles.gpa /
 * highest_degree_level / english_test_*` columns: those exist in the migration and in
 * ProfilePatchSchema but no UI has ever written or read them, so they are always empty.
 */
export async function findStudentSnapshot(userId: number): Promise<StudentEligibilitySnapshot> {
  const [qualifications, languageTests, academicTests] = await Promise.all([
    masterKnex("platform_user_qualifications")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("qualification_type", "grading_system", "grade_value", "end_date"),
    masterKnex("platform_user_language_tests")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("test_type", "overall_score", "sub_scores"),
    masterKnex("platform_user_academic_tests")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("test_type", "overall_score"),
  ]);
  return { qualifications, languageTests, academicTests } as StudentEligibilitySnapshot;
}

/** The student's ISO2, residence first then nationality — the same precedence matching uses. */
export async function findStudentCountryCode(userId: number): Promise<string | null> {
  const row = await masterKnex("platform_user_profiles as p")
    .leftJoin("countries as residence", "p.country_of_residence_id", "residence.id")
    .leftJoin("countries as nationality", "p.nationality_id", "nationality.id")
    .where("p.user_id", userId)
    .first("residence.iso2 as residence_code", "nationality.iso2 as nationality_code");
  return row?.residence_code ?? row?.nationality_code ?? null;
}

/**
 * The degree ladder, keyed by BOTH name and slug pointing at the same rank — the course
 * requirement stores `degree_levels.name` ("Bachelor's", written by the extraction admin form)
 * while the student stores `degree_levels.slug` ("bachelor", written by qualification-dialog).
 * One table, two spellings, one map.
 *
 * `other` is excluded: it is seeded last but is a bucket, not a rank, and treating it as the
 * highest degree would pass every requirement.
 */
export async function loadDegreeLadder(): Promise<Map<string, number>> {
  const rows = await masterKnex("degree_levels")
    .where({ is_active: true })
    .whereNot("slug", "other")
    .whereNull("deleted_at")
    .select("name", "slug", "sort_order");

  const map = new Map<string, number>();
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const r of rows) {
    map.set(key(r.name), r.sort_order);
    map.set(key(r.slug), r.sort_order);
  }
  return map;
}
