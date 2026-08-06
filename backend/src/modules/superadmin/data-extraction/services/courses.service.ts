// Extraction courses service.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/courses.repository.js";
import type { CreateCourseInput, PatchCourseInput } from "../schemas/courses.schema.js";

export async function listCourses(jobId: string) {
  return { courses: await repo.listCoursesByJob(jobId) };
}

export async function getCourseLinks(jobId: string) {
  return repo.getCourseLinks(jobId);
}

export async function createCourse(jobId: string, input: CreateCourseInput, adminId: number) {
  const row = await repo.insertCourse({
    job_id: jobId,
    ...input,
    verification_status: "manual",
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
  const found = await repo.updateCourse(id, data);
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_PATCH", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
}

export async function approveCourse(id: string, adminId: number) {
  const found = await repo.updateCourse(id, {
    verification_status: "confirmed",
    last_verified_at: new Date().toISOString(),
  });
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_APPROVE", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
}

export async function rejectCourse(id: string, adminId: number) {
  const found = await repo.updateCourse(id, { verification_status: "flagged" });
  if (!found) throw new NotFoundError("Course not found");
  await logAudit(adminId, "COURSE_REJECT", { entityType: "extraction_courses", entityId: id });
  return { updated: true };
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
