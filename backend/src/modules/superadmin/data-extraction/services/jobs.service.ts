// Extraction jobs service — CRUD, status transitions, pipeline control.

import { NotFoundError, ConflictError, BadRequestError } from "../../../../shared/errors.js";
import { jobUsageByModel } from "../lib/llm-store.js";
import { costUsd, totalCostUsd } from "../lib/llm-pricing.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../../shared/pagination.js";
import { logAudit } from "../shared/audit.js";
import { withActorNames, withActorNamesOne } from "../shared/actor-names.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { loadLookupLists, categoryForServiceSlug, courseCategoryForLevel } from "../lib/lookup-catalog.js";
import * as repo from "../repositories/jobs.repository.js";
import * as coursesRepo from "../repositories/courses.repository.js";
import * as reviewRepo from "../repositories/review.repository.js";
import * as stagedRepo from "../repositories/staged.repository.js";
import * as visaRepo from "../repositories/visa-services.repository.js";
import type { CreateJobInput, FailJobInput, PatchJobContextInput } from "../schemas/jobs.schema.js";

const logger = createChildLogger("extraction-jobs-service");

// ── Reads ──

// Institution jobs get their title from the overview row, service jobs from their
// own category's staging table. Only the still-nameless rows cost a second query.
// overview_name is a query-only column — it never reaches the wire.
async function withResolvedNames(rows: any[]) {
  const unnamed = rows.filter((r: any) => !r.institution_name && !r.overview_name);
  const serviceNames = await repo.findServiceNames(unnamed);
  return withActorNames(rows.map(({ overview_name, ...job }: any) => ({
    ...job,
    institution_name: job.institution_name ?? overview_name ?? serviceNames.get(job.id) ?? null,
  })));
}

export async function listJobs(opts: { status?: string; q?: string; limit: number }) {
  const [rows, counts] = await Promise.all([
    repo.listJobs(opts),
    repo.countJobsByStatus(),
  ]);
  return { jobs: await withResolvedNames(rows), counts };
}

export async function listJobsFiltered(
  opts: {
    statuses?: string[];
    excludeStatuses?: string[];
    sourceType?: string;
    excludeSourceTypes?: string[];
    businessCategoryId?: number;
    q?: string;
    sort?: repo.JobSort;
  },
  pagination: PaginationInput,
) {
  const filter = {
    statuses: opts.statuses,
    excludeStatuses: opts.excludeStatuses,
    sourceType: opts.sourceType,
    excludeSourceTypes: opts.excludeSourceTypes,
    businessCategoryId: opts.businessCategoryId,
    q: opts.q,
  };
  const [rows, total] = await Promise.all([
    repo.listJobsFiltered({
      ...filter,
      sort: opts.sort,
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
    }),
    repo.countJobsFiltered(filter),
  ]);
  const { data, meta } = buildPaginatedResponse(await withResolvedNames(rows), total, pagination);
  return { jobs: data, meta };
}

export async function getJob(id: string) {
  const { job, overview } = await repo.findJobWithOverview(id);
  if (!job) throw new NotFoundError("Extraction job not found");
  // Same title fallback the list uses — the overview row is already loaded here.
  // The overview carries its own editor: the Institution tab is edited field-by-field.
  const [jobWithActors, overviewWithActors, usageRows] = await Promise.all([
    withActorNamesOne({ ...job, institution_name: job.institution_name ?? overview?.name ?? null }),
    withActorNamesOne(overview),
    jobUsageByModel(id),
  ]);
  // Tokens are the record; dollars are derived here from LLM_MODEL_PRICES and null when any
  // model in the mix is unpriced — see llm-pricing.ts.
  const usage = {
    by_model: usageRows.map((r) => ({ ...r, cost_usd: costUsd(r.model, r.prompt_tokens, r.output_tokens) })),
    calls: usageRows.reduce((n, r) => n + r.calls, 0),
    cache_hits: usageRows.reduce((n, r) => n + r.cache_hits, 0),
    prompt_tokens: usageRows.reduce((n, r) => n + r.prompt_tokens, 0),
    output_tokens: usageRows.reduce((n, r) => n + r.output_tokens, 0),
    cost_usd: totalCostUsd(usageRows),
  };
  return { job: { ...jobWithActors, usage }, overview: overviewWithActors };
}

// Mirrors overallProgressPct in frontend/src/app/admin/data/all-extractions/components/
// extraction-job-row.tsx exactly, so a business/institution owner's progress bar reads the same
// percentage an admin sees. Kept as a straight port rather than a shared package — five string
// literals and a status list aren't worth a cross-app dependency.
const PROGRESS_STAGE_KEYS = ["mapping", "intelligence", "scraping", "extracting", "verifying"];
const PROGRESS_FINISHED_STATUSES = ["done", "approved", "verified", "exported"];

function computeProgressPct(job: {
  status: string;
  pipeline_progress: Record<string, { status: string; total?: number; done?: number }> | null;
  pages_scraped: number | null;
  total_pages_found: number | null;
  verification_score: number | null;
  verification_total: number | null;
}): number {
  if (job.status === "failed" || job.status === "declined") return 0;
  if (PROGRESS_FINISHED_STATUSES.includes(job.status) || job.status === "review") return 100;
  if (job.pipeline_progress) {
    const known = PROGRESS_STAGE_KEYS.map((k) => job.pipeline_progress![k]).filter(Boolean);
    if (known.length > 0) {
      const sum = known.reduce((acc, stage) => {
        if (stage!.status === "done") return acc + 1;
        if (stage!.status === "processing") return acc + Math.min(1, stage!.total ? (stage!.done || 0) / stage!.total : 0.5);
        return acc;
      }, 0);
      return Math.min(100, Math.round((sum / PROGRESS_STAGE_KEYS.length) * 100));
    }
  }
  if (job.total_pages_found) return Math.min(100, Math.round(((job.pages_scraped ?? 0) / job.total_pages_found) * 100));
  if (job.verification_total) return Math.min(100, Math.round(((job.verification_score ?? 0) / job.verification_total) * 100));
  return 0;
}

/**
 * Self-service extraction status for a business/institution's own linked job: status, progress
 * percentage, and entity counts only — never admin internals (LLM cost, job events, error
 * messages). Returns null when the job no longer exists (shouldn't happen once linked, but a
 * missing job is "nothing to show", not a 500).
 */
export async function getSelfServiceStatus(jobId: string) {
  const job = await repo.findJobById(jobId);
  if (!job) return null;
  const counts = await getTabCounts(jobId);
  return { status: job.status as string, progress_pct: computeProgressPct(job), counts };
}

export async function getTabCounts(jobId: string) {
  const [branches, agents, courses, fees, intakes, eligibility, units, studyOptions, accreditations, visaServices] =
    await Promise.all([
      reviewRepo.countCampusesByJob(jobId),
      reviewRepo.countAgentsByJob(jobId),
      coursesRepo.countCoursesByJob(jobId),
      coursesRepo.countCourseFeesByJob(jobId),
      coursesRepo.countIntakesByJob(jobId),
      coursesRepo.countEligibilityByJob(jobId),
      coursesRepo.countStudyUnitsByJob(jobId),
      coursesRepo.countStudyOptionsByJob(jobId),
      stagedRepo.countAccreditationsByJob(jobId),
      visaRepo.countVisaServicesByJob(jobId),
    ]);
  return {
    branches, agents, courses, fees, intakes, eligibility, units,
    study_options: studyOptions, accreditations, visa_services: visaServices,
  };
}

export async function getJobEvents(jobId: string, limit: number) {
  return { events: await repo.listJobEvents(jobId, limit) };
}

export async function getAgentRuns(jobId: string) {
  return { runs: await repo.listAgentRuns(jobId) };
}

// ── Creates ──

function conflictFor(existing: {
  id: string;
  institution_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
}) {
  return new ConflictError("An institution with a matching website already exists", {
    existing_job_id: existing.id,
    institution_name: existing.institution_name,
    website: existing.website,
    email: existing.email,
    phone: existing.phone,
  });
}

async function validateDegreeLevelCodes(codes: string[], serviceCategoryId?: number): Promise<string[]> {
  const { levels } = await loadLookupLists();
  const seeded = new Map(levels.map((l) => [l.slug, l.name]));
  const kept = [...new Set(codes)].filter((c) => seeded.has(c));
  if (!kept.length) {
    throw new BadRequestError("None of the selected degree levels exist. Pick from the list.");
  }

  const category = serviceCategoryId
    ? categoryForServiceSlug(
        (await masterKnex("public.service_categories").where({ id: serviceCategoryId }).first("slug"))?.slug,
      )
    : null;
  if (category) {
    const clash = kept.filter((c) => {
      const own = courseCategoryForLevel(c);
      return own && own !== category;
    });
    if (clash.length === kept.length) {
      throw new BadRequestError(
        `Those degree levels (${clash.map((c) => seeded.get(c)).join(", ")}) are not part of this service category. Pick levels it covers, or change the category.`,
      );
    }
  }
  return kept;
}

export async function createJob(input: CreateJobInput, adminId: number) {
  const host = repo.normaliseHost(input.institution_url);
  const degree_level_codes = input.degree_level_codes?.length
    ? await validateDegreeLevelCodes(input.degree_level_codes, input.service_category_id)
    : undefined;

  const row = await masterKnex.transaction(async (trx) => {
    if (host) await repo.lockInstitutionHost(host, trx);

    const existing = await repo.findJobByInstitutionHost(input.institution_url, trx);
    if (existing) throw conflictFor(existing);

    // The signed-in admin owns the job — the list shows them as the extractor.
    return repo.insertJob({ ...input, degree_level_codes, created_by_platform_user_id: adminId }, trx);
  });
  await logAudit(adminId, "EXTRACTION_JOB_CREATE", {
    entityType: "extraction_jobs",
    entityId: row.id,
    details: { institution_url: input.institution_url },
  });

  // Dispatch to pipeline worker
  try {
    await queueService.publish(EXTRACTION_QUEUES.JOBS, {
      jobId: row.id,
      institutionUrl: input.institution_url,
      guidedUrls: input.guided_urls,
      guidanceNotes: input.guidance_notes,
      sampleCourseUrl: input.sample_course_url,
    });
  } catch (err) {
    // Queue unavailable — job stays pending, worker can pick it up on next DB poll
    logger.warn("Queue unavailable, job will await manual or polled pickup", { jobId: row.id });
  }

  return { id: row.id };
}

// ── Status transitions ──

async function setJobStatus(
  id: string,
  status: string,
  adminId: number,
  action: string,
  extra?: Record<string, unknown>,
) {
  const found = await repo.updateJob(id, { status, ...extra }, adminId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, action, { entityType: "extraction_jobs", entityId: id });
  return { updated: true };
}

export function pauseJob(id: string, adminId: number) {
  return setJobStatus(id, "paused", adminId, "JOB_PAUSE");
}

export async function resumeJob(id: string, adminId: number) {
  const result = await setJobStatus(id, "extracting", adminId, "JOB_RESUME", {
    error_message: null,
    processing_heartbeat_at: null,
  });

  // Re-dispatch so the pipeline worker picks it back up
  try {
    await queueService.publish(EXTRACTION_QUEUES.JOBS, { jobId: id, resumed: true });
  } catch {
    logger.warn("Queue unavailable on resume, worker will poll", { jobId: id });
  }

  return result;
}

export function declineJob(id: string, adminId: number) {
  return setJobStatus(id, "declined", adminId, "JOB_DECLINE");
}

export async function failJob(id: string, input: FailJobInput, adminId: number) {
  const updates: Record<string, unknown> = { status: "failed" };
  if (input.error) updates.error_message = input.error;
  // ponytail: V2 optionally patches pipeline_progress phase — skipping, add if needed
  const found = await repo.updateJob(id, updates, adminId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_FAIL", {
    entityType: "extraction_jobs",
    entityId: id,
    details: { error: input.error },
  });
  return { updated: true };
}

export async function patchJobContext(id: string, input: PatchJobContextInput, adminId: number) {
  const updates: Record<string, unknown> = {};
  if (input.guided_urls !== undefined) updates.guided_urls = JSON.stringify(input.guided_urls);
  if (input.guidance_notes !== undefined) updates.guidance_notes = input.guidance_notes;
  if (input.step_mode !== undefined) updates.step_mode = input.step_mode;
  const found = await repo.updateJob(id, updates, adminId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_CONTEXT_UPDATE", { entityType: "extraction_jobs", entityId: id });
  return { updated: true };
}

export async function deleteJob(id: string, adminId: number) {
  const found = await repo.deleteJob(id);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_DELETE", { entityType: "extraction_jobs", entityId: id });
  return { updated: true };
}

export async function mergeDuplicates(id: string, dryRun: boolean, adminId: number) {
  // ponytail: V2 calls a SQL RPC (merge_extraction_job_duplicates) that doesn't exist in this repo.
  // Stub: returns empty result. Implement the SQL function when needed.
  const result = {};
  if (!dryRun) {
    await logAudit(adminId, "JOB_MERGE_DUPLICATES", { entityType: "extraction_jobs", entityId: id });
  }
  return result;
}
