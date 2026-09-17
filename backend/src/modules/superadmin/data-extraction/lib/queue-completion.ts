// Decides when a job's page-processing queue is fully resolved and advances the job to
// verification. Split out of extraction-page.worker.ts (which has a top-level queue consumer as
// a side effect of import — this file has none) so extraction-queue-reclaim.worker.ts can call
// the SAME transition logic without accidentally starting a second PAGES consumer.

import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { writeJobEvent, normaliseCampusName } from "./staging-writer.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("queue-completion");

async function deduplicateCampuses(jobId: string) {
  const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId });
  const groups = new Map<string, typeof campuses>();
  for (const c of campuses) {
    const key = normaliseCampusName(c.name);
    const arr = groups.get(key) || [];
    arr.push(c);
    groups.set(key, arr);
  }
  for (const [, dupes] of groups) {
    if (dupes.length <= 1) continue;
    const keep = dupes[0];
    const removeIds = dupes.slice(1).map((d) => d.id);
    await masterKnex(`${S}.extraction_course_campuses`)
      .whereIn("campus_id", removeIds)
      .update({ campus_id: keep.id });
    await masterKnex(`${S}.extraction_campuses`)
      .whereIn("id", removeIds)
      .delete();
    logger.info("Merged duplicate campuses", { kept: keep.name, removed: removeIds.length });
  }
}

/**
 * Check if all queue items are done and trigger verification if so.
 * "Done" = no items in a state that could still produce work (pending, processing).
 * Items in paused/ignored/stopped are treated as terminal — admin chose to skip them.
 */
export async function checkAllPagesDone(jobId: string) {
  const remaining = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId })
    .whereIn("status", ["pending", "processing"])
    .count("id as count")
    .first();

  if (Number(remaining?.count) === 0) {
    // Guard: only transition once — avoid duplicate verification dispatches from parallel workers
    const updated = await masterKnex(`${S}.extraction_jobs`)
      .where({ id: jobId, status: "processing" })
      .update({
        status: "extracting",
        pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "processing" }),
        updated_at: masterKnex.fn.now(),
      });

    if (updated === 0) {
      // Another worker already transitioned this job — skip
      return;
    }

    logger.info("All pages processed, dispatching verification", { jobId });
    await deduplicateCampuses(jobId);
    await writeJobEvent(jobId, "extraction_complete", {
      phase: "data_extraction", message: "All pages extracted, starting verification",
    });
    await queueService.publish(EXTRACTION_QUEUES.VERIFY, { jobId });
    const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
    if (!job?.source_type || job.source_type === "institution") {
      const hasCampuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).first();
      if (!hasCampuses) {
        await queueService.publish(EXTRACTION_QUEUES.STEPS, { jobId, step: "branches" });
      }
    }
  }
}
