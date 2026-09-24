// Eligibility check — the single implementation behind both GET /enquiries/eligibility/:courseId
// and the POST /enquiries gate, so the banner a student sees and the answer the server enforces
// can never disagree.

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/eligibility.repository.js";
import { evaluateEligibility, type EligibilityVerdict } from "../shared/eligibility.js";

/**
 * `applicable_to` says which audience a requirement row is for. Deriving the student's audience
 * needs their country against the course's — there is no stored classification.
 *
 * An unresolvable student country resolves to `international`: this is an international-education
 * product, that is the default audience, and the alternative (dropping every audience-specific
 * row) would report `unknown` for most courses. The choice is echoed back as `student_type` so
 * the UI can say what it assumed.
 */
function resolveStudentType(
  studentCountryCode: string | null,
  courseCountryCode: string | null,
): "domestic" | "international" {
  if (!studentCountryCode || !courseCountryCode) return "international";
  return studentCountryCode.toUpperCase() === courseCountryCode.toUpperCase() ? "domestic" : "international";
}

export async function getVerdict(studentId: number, courseId: string): Promise<EligibilityVerdict> {
  const course = await repo.findCourse(courseId);
  if (!course) throw new NotFoundError("Course not found");

  const [requirements, englishRequirements, student, studentCountryCode, degreeLadder] = await Promise.all([
    repo.findRequirementsForCourse(courseId, course.job_id ?? null),
    repo.findEnglishRequirementsForCourse(courseId, course.job_id ?? null),
    repo.findStudentSnapshot(studentId),
    repo.findStudentCountryCode(studentId),
    repo.loadDegreeLadder(),
  ]);

  const studentType = resolveStudentType(studentCountryCode, course.country_code ?? null);

  // 'both' is the column's default, so a row that never named an audience still applies.
  const applicable = requirements.filter(
    (r) => !r.applicable_to || r.applicable_to === "both" || r.applicable_to === studentType,
  );

  return evaluateEligibility({
    requirements: applicable,
    englishRequirements,
    degreeLadder,
    student,
    studentType,
  });
}
