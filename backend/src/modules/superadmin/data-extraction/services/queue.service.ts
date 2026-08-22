// Extraction queue service.

import { NotFoundError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService as pipelineQueue } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/queue.repository.js";

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

// Resets progress/queue like resetPipeline, then re-dispatches to the job worker
// so a failed job re-crawls from scratch instead of sitting at "pending".
export async function rerunJob(jobId: string, adminId: number) {
  const found = await repo.resetPipeline(jobId);
  if (!found) throw new NotFoundError("Extraction job not found");
  await logAudit(adminId, "JOB_RERUN", { entityType: "extraction_jobs", entityId: jobId });

  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch {
    logger.warn("Queue unavailable on rerun, worker will poll", { jobId });
  }

  return { updated: true };
}
