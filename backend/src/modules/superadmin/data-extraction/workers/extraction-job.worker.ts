// Worker — consumes "extraction_jobs" queue.
//
// Admits a job into the one-step-at-a-time chain and hands off: it marks the job processing and
// publishes the first step, `site_map`, to the STEPS queue. Everything that used to run here —
// homepage analysis, URL discovery, the URL classifier, queueing pages — is now its own step in
// lib/pipeline-steps.ts, run by extraction-step.worker.ts, so each can be inspected, re-run and
// (in manual step mode) waited on. See docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md.
//
// Run with: npm run job:extraction

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { isConfigured } from "../lib/llm-client.js";
import { writeJobEvent } from "../lib/staging-writer.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-job-worker");

await queueService.consume(EXTRACTION_QUEUES.JOBS, async (msg) => {
  let jobId: string, resumed: boolean | undefined;
  try {
    ({ jobId, resumed } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received job", { jobId, resumed: !!resumed });

  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) {
    logger.warn("Job not found, discarding", { jobId });
    return;
  }

  if (["paused", "declined", "failed", "exported"].includes(job.status)) {
    logger.info("Job not actionable, skipping", { jobId, status: job.status });
    return;
  }

  if (!isConfigured()) {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed", error_message: "GEMINI_API_KEY not configured", updated_at: masterKnex.fn.now(),
    });
    return;
  }

  try {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "processing",
      processing_heartbeat_at: masterKnex.fn.now(),
      // Legacy keys the job row still reads, plus the per-step keys the new tabs read.
      pipeline_progress: JSON.stringify({
        site_mapping: "processing", course_discovery: "waiting", data_extraction: "waiting", verification: "waiting",
        site_map: "processing", site_snapshot: "waiting", site_analysis: "waiting", url_classify: "waiting", queue_pages: "waiting",
      }),
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "pipeline_start", {
      phase: "site_mapping",
      message: `Starting site analysis (${job.step_mode === "manual" ? "manual" : "auto"} step mode)`,
      data: { step_mode: job.step_mode ?? "auto" },
    });

    // The first step always runs — manual mode gates the steps AFTER each one, not the start.
    await queueService.publish(EXTRACTION_QUEUES.STEPS, { jobId, step: "site_map" });
    logger.info("Job admitted to the step chain", { jobId, step: "site_map" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Job admission failed", { jobId, error: errMsg });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: errMsg,
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "pipeline_error", {
      level: "error", phase: "site_mapping", message: errMsg,
    });
  }
});

logger.info(`Extraction job worker started — consuming "${EXTRACTION_QUEUES.JOBS}" queue`);
