// Worker — consumes "extraction_pages" queue.
// Scrapes a single page to markdown via Crawl4AI/Firecrawl, sends to Gemini
// for structured extraction, writes courses + child entities to staging tables.
//
// Auto-scales via queueService.startScaling.
//
// Run with: npm run job:extraction-pages

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { truncateMarkdown } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import { courseExtractionPrompt, COURSE_EXTRACTION_SYSTEM } from "../lib/extraction-prompts.js";
import { writeCourse, upsertCampus, normaliseCampusName, writeJobEvent, type ExtractedCourse, type ExtractedCampus } from "../lib/staging-writer.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-page-worker");

interface ExtractionResult {
  courses: ExtractedCourse[];
  campuses_found: ExtractedCampus[];
}

// ponytail: merge duplicate campuses created by parallel workers (race condition)
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
    const removeIds = dupes.slice(1).map(d => d.id);
    // Re-point junction rows to the kept campus
    await masterKnex(`${S}.extraction_course_campuses`)
      .whereIn("campus_id", removeIds)
      .update({ campus_id: keep.id });
    await masterKnex(`${S}.extraction_campuses`)
      .whereIn("id", removeIds)
      .delete();
    logger.info("Merged duplicate campuses", { kept: keep.name, removed: removeIds.length });
  }
}

/** Check if all queue items are done (completed or failed) and trigger verification if so. */
async function checkAllPagesDone(jobId: string) {
  const remaining = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId })
    .whereIn("status", ["pending", "processing"])
    .count("id as count")
    .first();

  if (Number(remaining?.count) === 0) {
    logger.info("All pages processed, dispatching verification", { jobId });
    await deduplicateCampuses(jobId);
    await writeJobEvent(jobId, "extraction_complete", {
      phase: "data_extraction", message: "All pages extracted, starting verification",
    });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "processing" }),
      updated_at: masterKnex.fn.now(),
    });
    await queueService.publish(EXTRACTION_QUEUES.VERIFY, { jobId });
  }
}

await queueService.consume(EXTRACTION_QUEUES.PAGES, async (msg) => {
  const { jobId, queueItemId, url } = JSON.parse(msg!.content.toString());
  logger.info("Processing page", { jobId, queueItemId, url });

  // Check job is still active + load site intelligence hints
  const [job, siteIntel] = await Promise.all([
    masterKnex(`${S}.extraction_jobs`)
      .select("status", "stop_requested", "guidance_notes")
      .where({ id: jobId })
      .first(),
    masterKnex(`${S}.extraction_site_intelligence`)
      .select("fee_structure", "extraction_hints")
      .where({ job_id: jobId })
      .first(),
  ]);

  if (!job || job.stop_requested || ["paused", "failed", "declined"].includes(job.status)) {
    logger.info("Job not active, skipping page", { jobId, status: job?.status });
    return;
  }

  // Mark queue item processing
  await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
    status: "processing", updated_at: masterKnex.fn.now(),
  });
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    processing_heartbeat_at: masterKnex.fn.now(),
  });

  try {
    // ── Scrape page to markdown ──
    const page = await scrapeMarkdown(url, { onlyMainContent: true });

    if (page.blocked || page.markdown.length < 50) {
      logger.warn("Page blocked or empty", { url, scraper: page.scraper, error: page.error });
      await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
        status: "completed",
        extracted_data: JSON.stringify({ skipped: true, reason: page.blocked ? "blocked" : "minimal_content", scraper: page.scraper }),
        updated_at: masterKnex.fn.now(),
      });
      return;
    }

    const markdown = truncateMarkdown(page.markdown);

    // ── LLM extraction ──
    const extracted = await extractJson<ExtractionResult>({
      system: COURSE_EXTRACTION_SYSTEM,
      prompt: courseExtractionPrompt(url, markdown, job.guidance_notes, siteIntel),
      maxTokens: 16384,
    });

    // ── Write campuses first (courses reference them) ──
    const campusIdMap = new Map<string, string>();

    if (extracted.campuses_found?.length) {
      for (const campus of extracted.campuses_found) {
        if (!campus.name) continue;
        const campusId = await upsertCampus(jobId, campus);
        if (campusId) campusIdMap.set(normaliseCampusName(campus.name), campusId);
      }
    }

    // ── Write each course with child entities ──
    let coursesWritten = 0;

    if (extracted.courses?.length) {
      for (const course of extracted.courses) {
        if (!course.name) continue;

        // Upsert campuses mentioned in this course
        if (course.campus_names?.length) {
          for (const cn of course.campus_names) {
            if (!campusIdMap.has(normaliseCampusName(cn))) {
              const cid = await upsertCampus(jobId, { name: cn });
              if (cid) campusIdMap.set(cn.toLowerCase(), cid);
            }
          }
        }

        await writeCourse(jobId, { ...course, source_url: course.source_url ?? url }, campusIdMap);
        coursesWritten++;
      }
    }

    // ── Mark complete + update counters ──
    await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
      status: "completed",
      extracted_data: JSON.stringify({ courses_found: coursesWritten, campuses_found: campusIdMap.size, scraper: page.scraper }),
      updated_at: masterKnex.fn.now(),
    });

    if (coursesWritten > 0) {
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("courses_extracted", coursesWritten);
    }
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_scraped", 1);

    await writeJobEvent(jobId, "page_extracted", {
      phase: "data_extraction",
      message: `Extracted ${coursesWritten} courses from ${url}`,
      data: { url, courses: coursesWritten, campuses: campusIdMap.size, scraper: page.scraper },
    });

    logger.info("Page processed", { jobId, url, coursesWritten, scraper: page.scraper });

    await checkAllPagesDone(jobId);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Page processing failed", { jobId, queueItemId, url, error: errMsg });
    await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
      status: "failed",
      error: errMsg,
      failure_class: err instanceof Error ? err.constructor.name : "Unknown",
      retry_count: masterKnex.raw("retry_count + 1"),
      updated_at: masterKnex.fn.now(),
    });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_failed", 1);
    await writeJobEvent(jobId, "page_error", {
      level: "error", phase: "data_extraction",
      message: `Failed: ${errMsg}`,
      data: { url },
    });

    await checkAllPagesDone(jobId);
  }
});

await queueService.startScaling(EXTRACTION_QUEUES.PAGES, {
  prefetch: 1,
  queueSize: { scaleUpThreshold: 10, scaleDownThreshold: 2, maxWorkers: 10 },
  processingTime: { threshold: 30_000, windowSize: 10 },
  errorRate: { threshold: 0.2, windowSize: 20 },
  systemLoad: { cpuThreshold: 80, memoryThreshold: 85 },
}, 3);

logger.info(`Extraction page worker started — consuming "${EXTRACTION_QUEUES.PAGES}" queue with auto-scaling`);
