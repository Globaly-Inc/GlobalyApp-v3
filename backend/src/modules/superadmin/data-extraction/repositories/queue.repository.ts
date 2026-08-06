// Extraction queue repository.

import { masterKnex } from "../../../../core/db/master-pool.js";

const T = "superadmin.extraction_queue";
const T_JOBS = "superadmin.extraction_jobs";

export async function listQueueByJob(jobId: string, status?: string) {
  const query = masterKnex(T).where({ job_id: jobId }).orderBy("created_at", "asc");
  if (status) query.where("status", status);
  return query;
}

export async function updateQueueItem(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(T)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function deleteQueueItem(id: string) {
  const [row] = await masterKnex(T).where({ id }).delete().returning("id");
  return !!row;
}

export async function pauseAllPendingQueue(jobId: string) {
  return masterKnex(T)
    .where({ job_id: jobId })
    .whereIn("status", ["pending", "processing"])
    .update({ status: "paused", updated_at: masterKnex.fn.now() });
}

export async function deleteAllQueueForJob(jobId: string) {
  return masterKnex(T).where({ job_id: jobId }).delete();
}

// C8: stop-all — pause job + processing queue items
export async function stopAll(jobId: string) {
  const jobCount = await masterKnex(T_JOBS)
    .where({ id: jobId })
    .update({ status: "paused", updated_at: masterKnex.fn.now() });
  if (!jobCount) return false;
  await masterKnex(T)
    .where({ job_id: jobId, status: "processing" })
    .update({ status: "paused", updated_at: masterKnex.fn.now() });
  return true;
}

// C9: reset-pipeline
export async function resetPipeline(jobId: string) {
  const jobCount = await masterKnex(T_JOBS)
    .where({ id: jobId })
    .update({
      status: "pending",
      total_pages_found: 0,
      courses_extracted: 0,
      pages_scraped: 0,
      pages_failed: 0,
      processing_heartbeat_at: null,
      pipeline_progress: JSON.stringify({
        site_mapping: "waiting",
        course_discovery: "waiting",
        data_extraction: "waiting",
        verification: "waiting",
      }),
      updated_at: masterKnex.fn.now(),
    });
  if (!jobCount) return false;
  await deleteAllQueueForJob(jobId);
  return true;
}
