// Decides when a job's page-processing queue is fully resolved and advances the job to
// verification. Split out of extraction-page.worker.ts (which has a top-level queue consumer as
// a side effect of import — this file has none) so extraction-queue-reclaim.worker.ts can call
// the SAME transition logic without accidentally starting a second PAGES consumer.

import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { writeJobEvent, normaliseCampusName } from "./staging-writer.js";
import { DISCOVERY_STEP_ORDER } from "../schemas/step.schema.js";
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
  const counts = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId })
    .select(
      masterKnex.raw(`count(*) filter (where status in ('pending', 'processing')) as remaining`),
      masterKnex.raw("count(*) as total"),
    )
    .first() as { remaining: string | number; total: string | number } | undefined;

  // An EMPTY queue is not a finished queue. A job in manual step mode sits with no queue rows at
  // all until the admin runs queue_pages, and its heartbeat goes stale while it waits — the
  // reclaim sweep then calls this for it. Treating zero rows as "all done" would push that job
  // into verification and out of the chain. Every path that legitimately ends with nothing queued
  // (queue_pages finding nothing new) already moves the job to review itself.
  if (Number(counts?.total ?? 0) === 0) return;

  if (Number(counts?.remaining) === 0) {
    // A queue with nothing left doesn't mean discovery actually finished finding everything — if
    // resumeExtraction dispatched an incomplete discovery step and its publish failed, it marks
    // that step "failed" (not left stuck "processing", which a still-in-flight run could
    // legitimately hold) precisely so this check can catch it: without this, the pages that WERE
    // already queued finish, the queue reads empty, and verification starts even though the course
    // URLs that step was meant to find were never discovered (Greptile). Left "processing" —
    // exactly like a failed dispatchStep elsewhere in this module — until an admin notices and
    // resumes again.
    const jobRow = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).select("pipeline_progress").first();
    const progress = typeof jobRow?.pipeline_progress === "string"
      ? JSON.parse(jobRow.pipeline_progress) : (jobRow?.pipeline_progress || {});
    const failedStep = DISCOVERY_STEP_ORDER.find((s) => progress[s] === "failed");
    if (failedStep) {
      await writeJobEvent(jobId, "discovery_step_failed_blocks_completion", {
        level: "warn", phase: failedStep,
        message: `Queue is empty but discovery step "${failedStep}" failed to run — resume the job to find the rest before verification starts`,
        data: { failedStep },
      });
      return;
    }

    // A discovery step still legitimately IN FLIGHT is a different case from "failed" above: a
    // Resume can republish a handful of already-queued pages while dispatching queue_pages to find
    // the rest, and if those few pages happen to finish scraping before queue_pages gets through
    // its own (network-free but not instant) enumeration loop, the queue reads momentarily empty
    // even though discovery hasn't queued everything yet — starting verification here would do so
    // before every course URL was even found (Greptile). Not stuck: handleQueuePagesStep calls
    // this function itself the moment queue_pages actually finishes (below in
    // extraction-step.worker.ts), which is what re-checks and completes this the instant discovery
    // is genuinely done, even in the one case no page completion ever would — queue_pages finding
    // nothing new left to queue.
    const inFlightStep = DISCOVERY_STEP_ORDER.find((s) => progress[s] === "processing");
    if (inFlightStep) {
      logger.info("Queue empty but a discovery step is still running, deferring completion", { jobId, inFlightStep });
      return;
    }

    // Guard: only transition once — avoid duplicate verification dispatches from parallel workers
    const updated = await masterKnex(`${S}.extraction_jobs`)
      .where({ id: jobId, status: "processing" })
      .update({
        status: "extracting",
        // Merge, don't replace: the per-step keys (site_map … queue_pages) must survive.
        pipeline_progress: masterKnex.raw("coalesce(pipeline_progress, '{}'::jsonb) || ?::jsonb",
          [JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "processing" })]),
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
