// Staged entities + junctions service.

import { BadRequestError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/staged.repository.js";

// ── Study options ──

export async function createStudyOption(data: Record<string, unknown>, adminId: number) {
  const courseId = data.course_id as string | undefined;
  delete data.course_id;
  const row = await repo.studyOptions.insert(data);
  // Auto-assign to course if course_id provided
  if (courseId) {
    await repo.assignJunction("study-options", {
      job_id: data.job_id as string,
      course_id: courseId,
      entity_id: row.id,
    });
  }
  await logAudit(adminId, "STUDY_OPTION_CREATE", { entityType: "extraction_study_options", entityId: row.id });
  return { id: row.id };
}

export async function patchStudyOption(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.studyOptions.update(id, data);
  await logAudit(adminId, "STUDY_OPTION_PATCH", { entityType: "extraction_study_options", entityId: id });
  return { updated: true };
}

export async function deleteStudyOption(id: string, adminId: number) {
  await repo.studyOptions.delete(id);
  await logAudit(adminId, "STUDY_OPTION_DELETE", { entityType: "extraction_study_options", entityId: id });
  return { deleted: true };
}

// ── Course fees ──

export async function createCourseFee(data: Record<string, unknown>, adminId: number) {
  if (data.installments) data.installments = JSON.stringify(data.installments);
  const row = await repo.courseFees.insert(data);
  await logAudit(adminId, "COURSE_FEE_CREATE", { entityType: "extraction_course_fees", entityId: row.id });
  return { id: row.id };
}

export async function patchCourseFee(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.courseFees.update(id, data);
  await logAudit(adminId, "COURSE_FEE_PATCH", { entityType: "extraction_course_fees", entityId: id });
  return { updated: true };
}

export async function deleteCourseFee(id: string, adminId: number) {
  await repo.courseFees.delete(id);
  await logAudit(adminId, "COURSE_FEE_DELETE", { entityType: "extraction_course_fees", entityId: id });
  return { deleted: true };
}

// ── Intakes ──

export async function createIntake(data: Record<string, unknown>, adminId: number) {
  const row = await repo.intakes.insert(data);
  await logAudit(adminId, "INTAKE_CREATE", { entityType: "extraction_intakes", entityId: row.id });
  return { id: row.id };
}

export async function deleteIntake(id: string, adminId: number) {
  await repo.intakes.delete(id);
  await logAudit(adminId, "INTAKE_DELETE", { entityType: "extraction_intakes", entityId: id });
  return { deleted: true };
}

// ── Eligibility requirements ──

export async function createEligibility(data: Record<string, unknown>, adminId: number) {
  if (data.academic_tests) data.academic_tests = JSON.stringify(data.academic_tests);
  if (data.language_tests) data.language_tests = JSON.stringify(data.language_tests);
  const row = await repo.eligibility.insert(data);
  await logAudit(adminId, "ELIGIBILITY_CREATE", { entityType: "extraction_eligibility_requirements", entityId: row.id });
  return { id: row.id };
}

export async function patchEligibility(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.eligibility.update(id, data);
  await logAudit(adminId, "ELIGIBILITY_PATCH", { entityType: "extraction_eligibility_requirements", entityId: id });
  return { updated: true };
}

export async function deleteEligibility(id: string, adminId: number) {
  await repo.eligibility.delete(id);
  await logAudit(adminId, "ELIGIBILITY_DELETE", { entityType: "extraction_eligibility_requirements", entityId: id });
  return { deleted: true };
}

// ── Study units ──

export async function createStudyUnit(data: Record<string, unknown>, adminId: number) {
  const row = await repo.studyUnits.insert(data);
  await logAudit(adminId, "STUDY_UNIT_CREATE", { entityType: "extraction_study_units", entityId: row.id });
  return { id: row.id };
}

export async function patchStudyUnit(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.studyUnits.update(id, data);
  await logAudit(adminId, "STUDY_UNIT_PATCH", { entityType: "extraction_study_units", entityId: id });
  return { updated: true };
}

export async function deleteStudyUnit(id: string, adminId: number) {
  await repo.studyUnits.delete(id);
  await logAudit(adminId, "STUDY_UNIT_DELETE", { entityType: "extraction_study_units", entityId: id });
  return { deleted: true };
}

// ── Staged accreditations ──

export async function createAccreditation(data: Record<string, unknown>, adminId: number) {
  const row = await repo.accreditations.insert(data);
  await logAudit(adminId, "STAGED_ACCREDITATION_CREATE", { entityType: "extraction_accreditations", entityId: row.id });
  return { id: row.id };
}

export async function deleteAccreditation(id: string, adminId: number) {
  await repo.accreditations.delete(id);
  await logAudit(adminId, "STAGED_ACCREDITATION_DELETE", { entityType: "extraction_accreditations", entityId: id });
  return { deleted: true };
}

// ── Agents ──

export async function createAgent(data: Record<string, unknown>, adminId: number) {
  const row = await repo.agents.insert(data);
  await logAudit(adminId, "AGENT_CREATE", { entityType: "extraction_agents", entityId: row.id });
  return { id: row.id };
}

export async function deleteAgent(id: string, adminId: number) {
  await repo.agents.delete(id);
  await logAudit(adminId, "AGENT_DELETE", { entityType: "extraction_agents", entityId: id });
  return { deleted: true };
}

// ── Campuses ──

export async function createCampus(data: Record<string, unknown>, adminId: number) {
  const row = await repo.campuses.insert(data);
  await logAudit(adminId, "CAMPUS_CREATE", { entityType: "extraction_campuses", entityId: row.id });
  return { id: row.id };
}

export async function deleteCampus(id: string, adminId: number) {
  await repo.campuses.delete(id);
  await logAudit(adminId, "CAMPUS_DELETE", { entityType: "extraction_campuses", entityId: id });
  return { deleted: true };
}

// ── Junctions ──

export async function assignJunction(
  slug: string,
  data: { job_id: string; course_id: string; entity_id: string },
  adminId: number,
) {
  if (!repo.getJunctionInfo(slug)) throw new BadRequestError(`Unknown junction: ${slug}`);
  const row = await repo.assignJunction(slug, data);
  if (!row) throw new BadRequestError(`Unknown junction: ${slug}`);
  await logAudit(adminId, "JUNCTION_ASSIGN", { entityType: slug, entityId: row.id });
  return { id: row.id };
}

export async function unassignJunction(
  slug: string,
  data: { job_id: string; course_id: string; entity_id: string },
  adminId: number,
) {
  if (!repo.getJunctionInfo(slug)) throw new BadRequestError(`Unknown junction: ${slug}`);
  await repo.unassignJunction(slug, data);
  await logAudit(adminId, "JUNCTION_UNASSIGN", { entityType: slug });
  return { deleted: true };
}

export async function updateAccreditationMappings(
  jobId: string,
  extractionAccreditationIds: string[],
  accreditationId: string | null,
  adminId: number,
) {
  const updated = await repo.updateAccreditationMappings(jobId, extractionAccreditationIds, accreditationId);
  await logAudit(adminId, "ACCREDITATION_MAPPING_UPDATE", {
    entityType: "extraction_course_accreditation_assignments",
    details: { job_id: jobId, updated },
  });
  return { updated };
}
