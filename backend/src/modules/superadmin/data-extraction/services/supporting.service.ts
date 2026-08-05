// Supporting service — site profiles, lessons, save-and-learn.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/supporting.repository.js";
import type { SaveAndLearnInput } from "../schemas/supporting.schema.js";

// ── Site profiles ──

export async function listSiteProfiles(opts: { search?: string; limit: number }) {
  return { profiles: await repo.listSiteProfiles(opts) };
}

export async function getJobSiteProfile(jobId: string) {
  const url = await repo.getJobUrl(jobId);
  if (!url) throw new NotFoundError("Job not found");
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const profile = await repo.findSiteProfileByDomain(domain);
  return { profile: profile ?? null };
}

export async function upsertSiteProfile(data: Record<string, unknown>, adminId: number) {
  await repo.upsertSiteProfile(data);
  await logAudit(adminId, "SITE_PROFILE_UPSERT", {
    entityType: "extraction_site_profiles",
    details: { domain: data.domain },
  });
  return { updated: true };
}

// ── Lessons ──

export async function listLessons(opts: {
  domain?: string;
  step?: string;
  scope?: string;
  activeOnly?: boolean;
  limit: number;
}) {
  return { lessons: await repo.listLessons(opts) };
}

export async function patchLesson(id: string, isActive: boolean, adminId: number) {
  const found = await repo.updateLesson(id, { is_active: isActive });
  if (!found) throw new NotFoundError("Lesson not found");
  await logAudit(adminId, "LESSON_PATCH", { entityType: "extraction_lessons", entityId: id });
  return { updated: true };
}

export async function deleteLesson(id: string, adminId: number) {
  const found = await repo.deleteLesson(id);
  if (!found) throw new NotFoundError("Lesson not found");
  await logAudit(adminId, "LESSON_DELETE", { entityType: "extraction_lessons", entityId: id });
  return { deleted: true };
}

// ── Save and learn ──

// Map table names to extraction_memory step values
const TABLE_TO_STEP: Record<string, string> = {
  extraction_courses: "courses",
  extraction_institution_overview: "overview",
  extraction_campuses: "campuses",
  extraction_agents: "agents",
  extraction_intakes: "intakes",
  extraction_course_fees: "fees",
  extraction_eligibility_requirements: "eligibility",
  extraction_study_units: "study_units",
  extraction_accreditations: "accreditations",
};

export async function saveAndLearn(input: SaveAndLearnInput, adminId: number) {
  const { table, id, patch, job_id, source_url } = input;

  // Phase 1: patch the row
  const original = await repo.findEntityRow(table, id);
  if (!original) throw new NotFoundError(`Row not found in ${table}`);

  await repo.patchEntityRow(table, id, patch);

  // Derive domain from source_url or job's institution_url
  let domain = "unknown";
  if (source_url) {
    try { domain = new URL(source_url).hostname.replace(/^www\./, ""); } catch { /* keep unknown */ }
  } else if (job_id) {
    const jobUrl = await repo.getJobUrl(job_id);
    if (jobUrl) {
      try { domain = new URL(jobUrl).hostname.replace(/^www\./, ""); } catch { /* keep unknown */ }
    }
  }

  // Phase 2: record in extraction_memory
  await repo.insertMemory({
    job_id: job_id ?? null,
    domain,
    step: TABLE_TO_STEP[table] ?? table,
    entity_type: table,
    entity_ref: id,
    source_url: source_url ?? null,
    ai_output: JSON.stringify(original),
    final_output: JSON.stringify({ ...original, ...patch }),
    diff: JSON.stringify(patch),
  });

  // V3 fix for V2 bug B2: save-and-learn now writes audit log
  await logAudit(adminId, "SAVE_AND_LEARN", {
    entityType: table,
    entityId: id,
    details: { patch_keys: Object.keys(patch) },
  });

  // ponytail: skipping Phase 2 embedding — add when LLM memory search is implemented

  return { success: true };
}
