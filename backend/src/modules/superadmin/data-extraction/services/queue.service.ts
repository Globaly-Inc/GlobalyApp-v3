// Extraction queue service.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService as pipelineQueue } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/queue.repository.js";
import { findJobById, updateJob } from "../repositories/jobs.repository.js";
import { importAgentCIS } from "./agentcis.service.js";
import { dispatchStep } from "./step.service.js";

const logger = createChildLogger("extraction-queue-service");

export async function listQueue(jobId: string, status?: string) {
  return { queue: await repo.listQueueByJob(jobId, status) };
}

async function setQueueStatus(
  id: string,
  data: Record<string, unknown>,
  adminId: number,
  action: string,
) {
  const found = await repo.updateQueueItem(id, data);
  if (!found) throw new NotFoundError("Queue item not found");
  await logAudit(adminId, action, { entityType: "extraction_queue", entityId: id });
  return { updated: true };
}

export function ignoreQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "ignored" }, adminId, "QUEUE_IGNORE");
}

// This is a push queue (LavinMQ), not a polled one — flipping the DB row to "pending"
// does nothing on its own, nothing consumes it until a message is published. V2's
// retry/resume only touched the DB row (fine for its polling model); porting that
// as-is to V3 left retry/resume silently stuck forever with no re-scrape.
async function dispatchQueueItem(id: string) {
  const item = await repo.findQueueItem(id);
  if (!item) return;
  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.PAGES, { jobId: item.job_id, queueItemId: item.id, url: item.url });
  } catch {
    logger.warn("Queue unavailable dispatching retried item, worker will need a manual re-trigger", { queueItemId: id });
  }
}

export async function retryQueueItem(id: string, adminId: number) {
  const result = await setQueueStatus(
    id,
    { status: "pending", error: null, extracted_data: null, failure_class: null, retry_count: 0 },
    adminId,
    "QUEUE_RETRY",
  );
  await dispatchQueueItem(id);
  return result;
}

export function pauseQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "paused" }, adminId, "QUEUE_PAUSE");
}

export function stopQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "stopped" }, adminId, "QUEUE_STOP");
}

export async function resumeQueueItem(id: string, adminId: number) {
  const result = await setQueueStatus(id, { status: "pending", error: null }, adminId, "QUEUE_RESUME");
  await dispatchQueueItem(id);
  return result;
}

export async function deleteQueueItem(id: string, adminId: number) {
  const found = await repo.deleteQueueItem(id);
  if (!found) throw new NotFoundError("Queue item not found");
  await logAudit(adminId, "QUEUE_DELETE", { entityType: "extraction_queue", entityId: id });
  return { updated: true };
}

export async function pauseAllPendingQueue(jobId: string, adminId: number) {
  await repo.pauseAllPendingQueue(jobId);
  await logAudit(adminId, "QUEUE_PAUSE_ALL", { entityType: "extraction_jobs", entityId: jobId });
  return { updated: true };
}

export async function stopAll(jobId: string, adminId: number) {
  const found = await repo.stopAll(jobId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_STOP_ALL", { entityType: "extraction_jobs", entityId: jobId });
  return { updated: true };
}

export async function resetPipeline(jobId: string, adminId: number) {
  const found = await repo.resetPipeline(jobId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_RESET_PIPELINE", { entityType: "extraction_jobs", entityId: jobId });
  return { updated: true };
}

// Resumes a job's existing pending/failed work where possible, falling back to a full
// resetPipeline + re-crawl only when there's nothing queued yet to resume (see below).
//
// An AgentCIS-sourced job was never crawled from the institution's own website — it was
// imported wholesale from the AgentCIS API — so re-crawling its institution_url (the real
// site, e.g. concordia.ab.ca) is wrong on its face and was hitting Firecrawl rate limits for
// no reason. Re-run it the same way it was created: re-dispatch the AgentCIS import for the
// same institution (importAgentCIS creates a fresh job row; resetPipeline never applies here).
export async function rerunJob(jobId: string, adminId: number) {
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  if (job.source_type === "agentcis") {
    const progress = typeof job.pipeline_progress === "string"
      ? JSON.parse(job.pipeline_progress) : (job.pipeline_progress || {});
    const agentcisId = progress.agentcis_id;
    if (!agentcisId) {
      throw new BadRequestError("This AgentCIS job has no agentcis_id on record — cannot re-import");
    }
    await importAgentCIS([agentcisId], adminId);
    return { updated: true, reimport: true };
  }

  // Resume instead of restart: if this job already has pending/failed queue items, retry
  // just those (via the same "courses" step the Context tab's per-step Re-run uses) instead
  // of wiping the queue and re-billing Gemini to re-scrape + re-extract every page the job
  // already finished successfully. "Reset Pipeline" stays the explicit full-recrawl action
  // for when a genuine from-scratch redo is wanted.
  const retryable = await repo.countRetryableQueueItems(jobId);
  if (retryable > 0) {
    // Reactivate BEFORE dispatching — the page worker skips paused/failed/declined jobs,
    // so the reverse order would race it into silently dropping the re-dispatched pages.
    await repo.reactivateJob(jobId);
    await logAudit(adminId, "JOB_RERUN", { entityType: "extraction_jobs", entityId: jobId, details: { mode: "resume", retryable } });
    try {
      await dispatchStep(jobId, { step: "courses" }, adminId);
    } catch (err) {
      // Push queue: nothing consumes the reactivated job unless the step message actually
      // published. Without this rollback a failed dispatch (LavinMQ down) leaves the job
      // showing "processing" with a fresh heartbeat and no work queued — stalled until
      // someone notices. Restore the pre-rerun status so the failure state stays truthful.
      await updateJob(jobId, { status: job.status });
      throw err;
    }
    return { updated: true, mode: "resume" };
  }

  const found = await repo.resetPipeline(jobId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_RERUN", { entityType: "extraction_jobs", entityId: jobId, details: { mode: "full" } });

  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch {
    logger.warn("Queue unavailable on rerun, worker will poll", { jobId });
  }

  return { updated: true, mode: "full" };
}

// Deep scrape: the default page_cap (500) covers the course catalogue on most sites; this
// raises the budget by another 500 and re-dispatches the job worker, whose discovery then
// finds and queues the pages the cap refused (insertQueueItem dedupes the rest, so nothing
// already extracted is re-billed). Re-running the job worker also refreshes the institution
// overview (email/phone/logo) from the homepage. Explicit admin action = explicit extra spend.
export async function deepScrape(jobId: string, adminId: number) {
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");
  if (job.source_type === "agentcis") {
    throw new BadRequestError("AgentCIS jobs are imported from the AgentCIS API — there is no site to deep-scrape");
  }

  const pageCap = await repo.raisePageCap(jobId, 500);
  await repo.reactivateJob(jobId);
  await logAudit(adminId, "JOB_DEEP_SCRAPE", { entityType: "extraction_jobs", entityId: jobId, details: { page_cap: pageCap } });

  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch {
    logger.warn("Queue unavailable on deep scrape, worker will poll", { jobId });
  }

  return { updated: true, page_cap: pageCap };
}
