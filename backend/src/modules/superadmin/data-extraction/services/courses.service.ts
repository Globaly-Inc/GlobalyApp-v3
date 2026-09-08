// Extraction courses service.

import { NotFoundError } from "../../../../shared/errors.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../../shared/pagination.js";
import { logAudit } from "../shared/audit.js";
import { withActorNames } from "../shared/actor-names.js";
import * as repo from "../repositories/courses.repository.js";
import type { CreateCourseInput, PatchCourseInput } from "../schemas/courses.schema.js";
import { resolveCourseLookups } from "../lib/staging-writer.js";

export async function listCourses(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string; status?: string; sort?: repo.CourseSort },
) {
  const { sort, ...listFilters } = filters;
  const [courses, total, statusCounts] = await Promise.all([
    repo.listCoursesByJob(jobId, limit, offset, listFilters, sort),
    repo.countCoursesByJob(jobId, listFilters),
    repo.countCoursesByStatus(jobId),
  ]);
  return { ...buildPaginatedResponse(await withActorNames(courses), total, pagination), statusCounts };
}

export async function getCourseLinks(jobId: string) {
  return repo.getCourseLinks(jobId);
}

export async function listStudyUnits(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string },
) {
  const [studyUnits, total] = await Promise.all([
    repo.listStudyUnitsByJob(jobId, limit, offset, filters),
    repo.countStudyUnitsByJob(jobId, filters),
  ]);
  return buildPaginatedResponse(await withActorNames(studyUnits), total, pagination);
}

export async function listStudyOptions(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string },
) {
  const [studyOptions, total] = await Promise.all([
    repo.listStudyOptionsByJob(jobId, limit, offset, filters),
    repo.countStudyOptionsByJob(jobId, filters),
  ]);
  return buildPaginatedResponse(await withActorNames(studyOptions), total, pagination);
}

export async function listEligibility(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string },
) {
  const [rows, total] = await Promise.all([
    repo.listEligibilityByJob(jobId, limit, offset, filters),
    repo.countEligibilityByJob(jobId, filters),
  ]);
  return buildPaginatedResponse(await withActorNames(rows), total, pagination);
}

export async function listIntakes(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string },
) {
  const [rows, total] = await Promise.all([
    repo.listIntakesByJob(jobId, limit, offset, filters),
    repo.countIntakesByJob(jobId, filters),
  ]);
  return buildPaginatedResponse(await withActorNames(rows), total, pagination);
}

export async function listCourseFees(
  jobId: string,
  limit: number,
  offset: number,
  pagination: PaginationInput,
  filters: { search?: string },
) {
  const [rows, total] = await Promise.all([
    repo.listCourseFeesByJob(jobId, limit, offset, filters),
    repo.countCourseFeesByJob(jobId, filters),
  ]);
  return buildPaginatedResponse(await withActorNames(rows), total, pagination);
}

export async function createCourse(jobId: string, input: CreateCourseInput, adminId: number) {
  const row = await repo.insertCourse({
    job_id: jobId,
    ...input,
    verification_status: "manual",
    created_by_platform_user_id: adminId,
  });
  await logAudit(adminId, "COURSE_CREATE", {
    entityType: "extraction_courses",
    entityId: row.id,
    details: { job_id: jobId, name: input.name },
  });
  return { id: row.id };
}

export async function patchCourse(id: string, input: PatchCourseInput, adminId: number) {
  const data: Record<string, unknown> = { ...input };
  if (input.career_paths) data.career_paths = input.career_paths;
  const found = await repo.updateCourse(id, data, adminId);
  // An admin edit obeys the same closed lists as extraction, through the same resolver: the value
  // is placed on a seeded row, or the link is CLEARED. It is never stored as an unlinkable value,
  // and this path can no more create an area or a level than the pickers can.
  if ("degree_level" in input || "subject_area" in input) {
    const link = await resolveCourseLookups({
      name: input.name ?? "",
      degree_level: input.degree_level,
      subject_area: input.subject_area,
      area_of_study: input.subject_area,
    });
    if ("degree_level" in input) {
      data.degree_level = link.degree_level;
      data.degree_level_code = link.degree_level_code;
    }
    if ("subject_area" in input) data.subject_area_code = link.subject_area_code;
  }
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_PATCH", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
}

export async function approveCourse(id: string, adminId: number) {
  const found = await repo.updateCourse(id, {
    verification_status: "confirmed",
    last_verified_at: new Date().toISOString(),
  }, adminId);
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_APPROVE", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
}

export async function bulkVerifyCourses(ids: string[], approve: boolean, adminId: number) {
  const data = approve
    ? { verification_status: "confirmed", last_verified_at: new Date().toISOString() }
    : { verification_status: "flagged" };
  const updated = await repo.updateCoursesByIds(ids, data, adminId);
  if (updated === 0) throw new NotFoundError("No courses found");
  await logAudit(adminId, approve ? "COURSE_APPROVE" : "COURSE_REJECT", {
    entityType: "extraction_courses",
    details: { ids, count: updated },
  });
  return { updated };
}

export async function rejectCourse(id: string, adminId: number) {
  const found = await repo.updateCourse(id, { verification_status: "flagged" }, adminId);
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_REJECT", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
}

export async function deleteCourse(id: string, adminId: number) {
  const found = await repo.deleteCourse(id);
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_DELETE", { entityType: "extraction_courses", entityId: id });
  return { deleted: true };
}

export async function bulkDeleteCourses(ids: string[], adminId: number) {
  const deleted = await repo.deleteCoursesByIds(ids);
  if (deleted === 0) throw new NotFoundError("No courses found");
  await logAudit(adminId, "COURSE_DELETE", { entityType: "extraction_courses", details: { ids, count: deleted } });
  return { deleted };
}

// ── Accreditation links ──

export async function getAccreditationLinks(courseId: string) {
  return { accreditations: await repo.getCourseAccreditationLinks(courseId) };
}

export async function linkAccreditation(
  courseId: string,
  jobId: string,
  accreditationId: string,
  adminId: number,
) {
  const row = await repo.insertAccreditationLink({
    job_id: jobId,
    course_id: courseId,
    accreditation_id: accreditationId,
  });
  await logAudit(adminId, "ACCREDITATION_LINK", {
    entityType: "extraction_course_accreditation_assignments",
    entityId: row.id,
  });
  return { id: row.id };
}

export async function unlinkAccreditation(courseId: string, accreditationId: string, adminId: number) {
  const found = await repo.deleteAccreditationLink(courseId, accreditationId);
  if (!found) throw new NotFoundError("Accreditation link not found");
  await logAudit(adminId, "ACCREDITATION_UNLINK", {
    entityType: "extraction_course_accreditation_assignments",
    details: { course_id: courseId, accreditation_id: accreditationId },
  });
  return { deleted: true };
}
