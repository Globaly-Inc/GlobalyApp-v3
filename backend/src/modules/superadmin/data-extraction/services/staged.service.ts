// Staged entities + junctions service.

import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/staged.repository.js";
import { withActorNames } from "../shared/actor-names.js";
import { courseIdsForStudyOption, syncCourseDurationFromOptions, upsertStudyOption } from "../lib/staging-writer.js";

// ── Study options ──

// Through the shared upsert, not the generic insertEntity every other staged entity uses: study
// options are shared per job (migration 20260911_001's unique index), so a raw insert of a tuple
// another course in this job already has throws a constraint violation instead of the admin form
// correctly reusing/linking that existing row like the pipeline already does.
//
// Audits the ACTUAL outcome, not always a creation (review finding, 2026-09-15): reusing an
// existing shared option previously still logged STUDY_OPTION_CREATE even for a same-course
// resubmission that created neither a row nor a link — overstating what the admin did.
export async function createStudyOption(data: Record<string, unknown>, adminId: number) {
  const courseId = data.course_id as string | undefined;
  const jobId = data.job_id as string;
  const { id: optionId, created } = await upsertStudyOption(jobId, data, adminId);

  let linked = false;
  if (courseId) {
    const assignment = await repo.assignJunction("study-options", { job_id: jobId, course_id: courseId, entity_id: optionId });
    linked = assignment?.linked ?? false;
    await syncCourseDurationFromOptions([courseId]);
  }

  if (created) {
    await logAudit(adminId, "STUDY_OPTION_CREATE", { entityType: "extraction_study_options", entityId: optionId });
  } else if (linked) {
    await logAudit(adminId, "STUDY_OPTION_LINK", { entityType: "extraction_study_options", entityId: optionId });
  }
  // Else: an existing option was reused AND already linked (or nothing was asked to link) — a
  // true no-op, so nothing is recorded rather than a misleading "created" or "linked" event.
  return { id: optionId };
}

export async function patchStudyOption(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.studyOptions.update(id, data, adminId);
  await syncCourseDurationFromOptions(await courseIdsForStudyOption(id));
  await logAudit(adminId, "STUDY_OPTION_PATCH", { entityType: "extraction_study_options", entityId: id });
  return { updated: true };
}

export async function deleteStudyOption(id: string, adminId: number) {
  const courses = await courseIdsForStudyOption(id); // before the delete cascades the assignments away
  await repo.studyOptions.delete(id);
  await syncCourseDurationFromOptions(courses);
  await logAudit(adminId, "STUDY_OPTION_DELETE", { entityType: "extraction_study_options", entityId: id });
  return { deleted: true };
}

// ── Course fees ──

export async function createCourseFee(data: Record<string, unknown>, adminId: number) {
  const courseIds = (data.course_ids as string[] | undefined) ?? [];
  delete data.course_ids;
  if (data.installments) data.installments = JSON.stringify(data.installments);
  const row = await repo.courseFees.insert(data, adminId);
  for (const courseId of courseIds) {
    await repo.assignJunction("course-fees", {
      job_id: data.job_id as string,
      course_id: courseId,
      entity_id: row.id,
    });
  }
  await logAudit(adminId, "COURSE_FEE_CREATE", { entityType: "extraction_course_fees", entityId: row.id });
  return { id: row.id };
}

export async function patchCourseFee(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.courseFees.update(id, data, adminId);
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
  const row = await repo.intakes.insert(data, adminId);
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
  const row = await repo.eligibility.insert(data, adminId);
  await logAudit(adminId, "ELIGIBILITY_CREATE", { entityType: "extraction_eligibility_requirements", entityId: row.id });
  return { id: row.id };
}

export async function patchEligibility(id: string, data: Record<string, unknown>, adminId: number) {
  // Same serialisation as createEligibility above — node-postgres renders a JS array as a
  // Postgres array literal, which a jsonb column rejects. The admin edit form currently reaches
  // these columns through saveAndLearn (patchEntityRow serialises), so this route has never been
  // called with them; it would break the first caller that does.
  if (data.academic_tests) data.academic_tests = JSON.stringify(data.academic_tests);
  if (data.language_tests) data.language_tests = JSON.stringify(data.language_tests);
  await repo.eligibility.update(id, data, adminId);
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
  const row = await repo.studyUnits.insert(data, adminId);
  await logAudit(adminId, "STUDY_UNIT_CREATE", { entityType: "extraction_study_units", entityId: row.id });
  return { id: row.id };
}

export async function patchStudyUnit(id: string, data: Record<string, unknown>, adminId: number) {
  await repo.studyUnits.update(id, data, adminId);
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
  const row = await repo.accreditations.insert(data, adminId);
  await logAudit(adminId, "STAGED_ACCREDITATION_CREATE", { entityType: "extraction_accreditations", entityId: row.id });
  return { id: row.id };
}

export async function deleteAccreditation(id: string, adminId: number) {
  await repo.accreditations.delete(id);
  await logAudit(adminId, "STAGED_ACCREDITATION_DELETE", { entityType: "extraction_accreditations", entityId: id });
  return { deleted: true };
}

export async function getJobAccreditations(jobId: string) {
  const { scraped, assignments } = await repo.getJobAccreditations(jobId);
  return { scraped: await withActorNames(scraped), assignments };
}

// ── Global accreditation library ──

export async function listLibraryAccreditations() {
  return { accreditations: await repo.accreditationLibrary.list() };
}

export async function createLibraryAccreditation(data: Record<string, unknown>, adminId: number) {
  const row = await repo.accreditationLibrary.insert(data);
  await logAudit(adminId, "ACCREDITATION_LIBRARY_CREATE", { entityType: "accreditations", entityId: row.id });
  return row;
}

export async function patchLibraryAccreditation(id: string, data: Record<string, unknown>, adminId: number) {
  const row = await repo.accreditationLibrary.update(id, data);
  if (!row) throw new NotFoundError("Accreditation not found");
  await logAudit(adminId, "ACCREDITATION_LIBRARY_PATCH", { entityType: "accreditations", entityId: id });
  return row;
}

export async function deleteLibraryAccreditation(id: string, adminId: number) {
  const deleted = await repo.accreditationLibrary.delete(id);
  if (!deleted) throw new NotFoundError("Accreditation not found");
  await logAudit(adminId, "ACCREDITATION_LIBRARY_DELETE", { entityType: "accreditations", entityId: id });
  return { deleted: true };
}

// ── Agents ──

export async function createAgent(data: Record<string, unknown>, adminId: number) {
  const row = await repo.agents.insert(data, adminId);
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
  const row = await repo.campuses.insert(data, adminId);
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
  if (slug === "study-options") await syncCourseDurationFromOptions([data.course_id]);
  // Same accuracy fix as createStudyOption: "link existing" clicked on something already linked
  // is a no-op, not a fresh assignment worth an audit entry.
  if (row.linked) await logAudit(adminId, "JUNCTION_ASSIGN", { entityType: slug, entityId: row.id });
  return { id: row.id };
}

export async function unassignJunction(
  slug: string,
  data: { job_id: string; course_id: string; entity_id: string },
  adminId: number,
) {
  if (!repo.getJunctionInfo(slug)) throw new BadRequestError(`Unknown junction: ${slug}`);
  await repo.unassignJunction(slug, data);
  if (slug === "study-options") await syncCourseDurationFromOptions([data.course_id]);
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
