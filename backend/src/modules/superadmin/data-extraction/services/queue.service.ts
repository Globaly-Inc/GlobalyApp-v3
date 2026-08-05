// Extraction queue service.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/queue.repository.js";

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

export function retryQueueItem(id: string, adminId: number) {
  return setQueueStatus(
    id,
    { status: "pending", error: null, extracted_data: null, failure_class: null, retry_count: 0 },
    adminId,
    "QUEUE_RETRY",
  );
}

export function pauseQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "paused" }, adminId, "QUEUE_PAUSE");
}

export function stopQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "stopped" }, adminId, "QUEUE_STOP");
}

export function resumeQueueItem(id: string, adminId: number) {
  return setQueueStatus(id, { status: "pending", error: null }, adminId, "QUEUE_RESUME");
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
