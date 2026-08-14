// Extraction jobs service — CRUD, status transitions, pipeline control.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { logAudit } from "../shared/audit.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import * as repo from "../repositories/jobs.repository.js";
import type { CreateJobInput, FailJobInput, PatchJobContextInput } from "../schemas/jobs.schema.js";

const logger = createChildLogger("extraction-jobs-service");

// ── Reads ──

export async function listJobs(opts: { status?: string; q?: string; limit: number }) {
  const [rows, counts] = await Promise.all([
    repo.listJobs(opts),
    repo.countJobsByStatus(),
  ]);
  // Institution jobs get their title from the overview row, service jobs from their
  // own category's staging table. Only the still-nameless rows cost a second query.
  const unnamed = rows.filter((r: any) => !r.institution_name && !r.overview_name);
  const serviceNames = await repo.findServiceNames(unnamed);
  const jobs = rows.map(({ overview_name, ...job }: any) => ({
    ...job,
    institution_name: job.institution_name ?? overview_name ?? serviceNames.get(job.id) ?? null,
  }));
  return { jobs, counts };
}

export async function listJobsFiltered(opts: {
  statuses?: string[];
  sourceType?: string;
  excludeSourceType?: string;
  limit: number;
}) {
  return { jobs: await repo.listJobsFiltered(opts) };
}

export async function getJob(id: string) {
  const { job, overview } = await repo.findJobWithOverview(id);
  if (!job) throw new NotFoundError("Extraction job not found");
  // Same title fallback the list uses — the overview row is already loaded here.
  return { job: { ...job, institution_name: job.institution_name ?? overview?.name ?? null }, overview };
}

export async function getJobEvents(jobId: string, limit: number) {
  return { events: await repo.listJobEvents(jobId, limit) };
}

export async function getAgentRuns(jobId: string) {
  return { runs: await repo.listAgentRuns(jobId) };
}

// ── Creates ──

export async function createJob(input: CreateJobInput, adminId: number) {
  const row = await repo.insertJob(input);
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
  const found = await repo.updateJob(id, { status, ...extra });
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
  const found = await repo.updateJob(id, updates);
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
  const found = await repo.updateJob(id, updates);
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
