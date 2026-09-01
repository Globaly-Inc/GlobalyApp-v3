// Worker — consumes "extraction_verify" queue.
// Re-scrapes source URLs and uses Gemini to compare extracted data against live content.
//
// Run with: npm run job:extraction-verify

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { truncateMarkdown } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import { verificationPrompt, VERIFICATION_SYSTEM } from "../lib/extraction-prompts.js";
import { writeJobEvent } from "../lib/staging-writer.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-verify-worker");

const MAX_COURSES_TO_VERIFY = 20;
const FIELDS_TO_VERIFY = ["name", "degree_level", "duration_weeks", "domestic_fee_total", "international_fee_total"];

interface VerifyResult {
  results: Array<{
    field_name: string;
    extracted_value: string;
    live_value: string | null;
    status: "match" | "mismatch" | "not_found";
  }>;
}

await queueService.consume(EXTRACTION_QUEUES.VERIFY, async (msg) => {
  let jobId: string, force: boolean | undefined;
  try {
    ({ jobId, force } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Starting verification", { jobId });

  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) { logger.warn("Job not found", { jobId }); return; }
  if (["paused", "declined", "failed", "review", "done", "exported"].includes(job.status)) {
    logger.info("Job not actionable", { jobId, status: job.status });
    return;
  }

  await writeJobEvent(jobId, "verification_start", { phase: "verification", message: "Starting verification" });

  try {
    // Incremental by default: only verify courses new or re-extracted since their last
    // verification — the automatic post-run dispatch used to re-scrape and re-bill Gemini
    // for the same first-20 courses on EVERY rerun cycle, even when nothing changed.
    // The Context tab's manual verification step passes force to re-check everything.
    const courses = await masterKnex(`${S}.extraction_courses`)
      .where({ job_id: jobId })
      .whereNotNull("source_url")
      .modify((qb) => {
        if (!force) qb.where((w) => w.whereNull("last_verified_at").orWhereRaw("updated_at > last_verified_at"));
      })
      .limit(MAX_COURSES_TO_VERIFY);

    let verifiedCount = 0;
    let totalChecks = 0;
    let matchCount = 0;

    for (const course of courses) {
      // Check still active
      const current = await masterKnex(`${S}.extraction_jobs`).select("status", "stop_requested").where({ id: jobId }).first();
      if (!current || current.stop_requested || current.status === "paused") return;

      try {
        const page = await scrapeMarkdown(course.source_url, { onlyMainContent: true });

        if (page.blocked || page.markdown.length < 50) {
          for (const field of FIELDS_TO_VERIFY) {
            if (course[field] == null) continue;
            await masterKnex(`${S}.extraction_verification_results`).insert({
              job_id: jobId, course_id: course.id, field_name: field,
              extracted_value: String(course[field]), live_value: null, status: "not_found",
            });
            totalChecks++;
          }
          continue;
        }

        const liveText = truncateMarkdown(page.markdown, 40_000);

        const fieldsMap: Record<string, string> = {};
        for (const field of FIELDS_TO_VERIFY) {
          if (course[field] != null) fieldsMap[field] = String(course[field]);
        }
        if (Object.keys(fieldsMap).length === 0) continue;

        const result = await extractJson<VerifyResult>({
          system: VERIFICATION_SYSTEM,
          prompt: verificationPrompt({ name: course.name, fields: fieldsMap }, liveText),
        });

        for (const r of result.results) {
          await masterKnex(`${S}.extraction_verification_results`).insert({
            job_id: jobId, course_id: course.id, field_name: r.field_name,
            extracted_value: r.extracted_value, live_value: r.live_value ?? null, status: r.status,
          });
          totalChecks++;
          if (r.status === "match") matchCount++;
        }

        // Stamp the course itself — the review UI reads this, not the per-field results table.
        await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({
          verification_status: result.results.every((r) => r.status === "match") ? "verified" : "mismatch",
          last_verified_at: masterKnex.fn.now(),
        });

        verifiedCount++;
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });

      } catch (err) {
        logger.warn("Failed to verify course", { courseId: course.id, error: (err as Error).message });
        await writeJobEvent(jobId, "verification_error", {
          level: "warn", phase: "verification",
          message: `Failed to verify "${course.name}": ${(err as Error).message}`,
          data: { course_id: course.id },
        });
      }
    }

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "review",
      // An incremental pass covered only the changed courses — add to the standing score
      // instead of clobbering it with this pass's partial count. A forced full pass owns it.
      verification_score: force ? matchCount : masterKnex.raw("COALESCE(verification_score, 0) + ?", [matchCount]),
      verification_total: force ? totalChecks : masterKnex.raw("COALESCE(verification_total, 0) + ?", [totalChecks]),
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "done" }),
      updated_at: masterKnex.fn.now(),
    });

    await writeJobEvent(jobId, "verification_complete", {
      phase: "verification",
      message: `Verification complete: ${matchCount}/${totalChecks} matched across ${verifiedCount} courses`,
      data: { verified: verifiedCount, total_checks: totalChecks, matches: matchCount },
    });

    logger.info("Verification complete", { jobId, verifiedCount, totalChecks, matchCount });

  } catch (err) {
    logger.error("Verification failed", { jobId, error: err });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "pipeline_error", {
      level: "error", phase: "verification", message: err instanceof Error ? err.message : String(err),
    });
  }
});

logger.info(`Extraction verify worker started — consuming "${EXTRACTION_QUEUES.VERIFY}" queue`);
