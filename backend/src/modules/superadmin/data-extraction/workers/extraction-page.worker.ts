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
import {
  courseExtractionPrompt, COURSE_EXTRACTION_SYSTEM, studyUnitsFromPagePrompt, STUDY_UNITS_SYSTEM,
  visaServiceExtractionPrompt, VISA_SERVICE_EXTRACTION_SYSTEM,
} from "../lib/extraction-prompts.js";
import {
  writeCourse, upsertCampus, normaliseCampusName, writeVisaService, insertQueueItem, writeJobEvent,
  type ExtractedCourse, type ExtractedCampus, type ExtractedStudyUnit, type ExtractedVisaService,
} from "../lib/staging-writer.js";
import { recallMemory, rememberMemory, buildSystemAddendum } from "../lib/memory-client.js";
import { domainOf } from "../lib/html-utils.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-page-worker");

/** Detect paginated sibling pages from links (DataTables, ?page=N, /page/N). */
function detectPaginationUrls(baseUrl: string, links: string[], markdown: string): string[] {
  let baseObj: URL | null = null;
  try { baseObj = new URL(baseUrl); } catch { return []; }
  const pageNums = new Set<number>();
  for (const l of links) {
    const m = l.match(/[?&]page=(\d+)|\/page\/(\d+)/i);
    if (m) { const n = parseInt(m[1] || m[2], 10); if (n >= 1 && n <= 1000) pageNums.add(n); }
  }
  // DataTables "Showing 1 to 10 of 486 entries"
  const dtMatch = markdown.match(/Showing\s+\d+\s+to\s+(\d+)\s+of\s+(\d+)\s+entries/i);
  if (dtMatch) {
    const perPage = parseInt(dtMatch[1], 10);
    const total = parseInt(dtMatch[2], 10);
    if (perPage > 0 && total > perPage) {
      for (let i = 2; i <= Math.ceil(total / perPage); i++) pageNums.add(i);
    }
  }
  if (!baseObj || pageNums.size === 0) return [];
  return Array.from(pageNums)
    .filter(n => n !== 1)
    .sort((a, b) => a - b)
    .map(n => { const u = new URL(baseObj!.toString()); u.searchParams.set("page", String(n)); return u.toString(); });
}

// ponytail: ported from V2's classifyFailure + routeFailure
type FailureClass = "anti_bot" | "not_a_course" | "ai_5xx" | "parse_error" | "other";

function classifyFailure(error: string): FailureClass {
  const e = error.toLowerCase();
  if (e.includes("blocked") || e.includes("minimal_content") || e.includes("empty") || e.includes("anti-bot")) return "anti_bot";
  if (e.includes("not a course") || e.includes("blog") || e.includes("news") || e.includes("staff")) return "not_a_course";
  if (e.includes("429") || e.includes("503") || /5\d{2}/.test(e) || e.includes("5xx")) return "ai_5xx";
  if (e.includes("parse") || e.includes("no structured data")) return "parse_error";
  return "other";
}

interface ExtractionResult {
  courses: ExtractedCourse[];
  campuses_found: ExtractedCampus[];
}

interface VisaServiceExtractionResult {
  visa_services: ExtractedVisaService[];
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

// ponytail: bound worst-case secondary-fetch cost per page scrape (a listing page can
// yield many courses); see docs/data-extraction/2026-08-21-study-units-discovery-design.md
const SECONDARY_FETCH_CAP = 20;

/**
 * Narrow follow-up fetch for a course's own curriculum page, when the primary page's
 * extraction came back with no study_units but flagged a link to one. Every failure
 * mode here logs and returns empty — it must never fail the course write.
 */
async function fetchCurriculumUnits(curriculumUrl: string, primaryUrl: string, jobId: string): Promise<ExtractedStudyUnit[]> {
  let resolved: URL;
  try {
    resolved = new URL(curriculumUrl, primaryUrl);
  } catch {
    logger.warn("Invalid curriculum_page_url, skipping secondary fetch", { jobId, primaryUrl, curriculumUrl });
    return [];
  }

  try {
    const page = await scrapeMarkdown(resolved.toString(), { onlyMainContent: true });
    if (page.blocked || page.markdown.length < 50) {
      logger.warn("Curriculum page blocked or empty, skipping secondary fetch", { jobId, curriculumUrl: resolved.toString() });
      return [];
    }
    const result = await extractJson<{ study_units: ExtractedStudyUnit[] }>({
      system: STUDY_UNITS_SYSTEM,
      prompt: studyUnitsFromPagePrompt(resolved.toString(), truncateMarkdown(page.markdown)),
    });
    return result.study_units ?? [];
  } catch (err) {
    logger.warn("Curriculum page extraction failed, skipping", {
      jobId, curriculumUrl: resolved.toString(), error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Check if all queue items are done and trigger verification if so.
 * "Done" = no items in a state that could still produce work (pending, processing).
 * Items in paused/ignored/stopped are treated as terminal — admin chose to skip them.
 */
async function checkAllPagesDone(jobId: string) {
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
  }
}

await queueService.consume(EXTRACTION_QUEUES.PAGES, async (msg) => {
  let jobId: string, queueItemId: string, url: string, forceFirecrawl: boolean | undefined, mobile: boolean | undefined,
    proxy: "stealth" | "auto" | undefined, expandCollapsed: boolean | undefined;
  try {
    ({ jobId, queueItemId, url, forceFirecrawl, mobile, proxy, expandCollapsed } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Processing page", { jobId, queueItemId, url, forceFirecrawl: !!forceFirecrawl });

  // Check job is still active + load site intelligence hints
  const [job, siteIntel] = await Promise.all([
    masterKnex(`${S}.extraction_jobs`)
      .select("status", "stop_requested", "guidance_notes", "source_type")
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

  // ponytail: check URL against blocklist before scraping
  const blocklistRow = await masterKnex(`${S}.extraction_additional_info`)
    .where({ job_id: jobId, key: "url_blocklist_patterns" })
    .select("value")
    .first();
  if (blocklistRow?.value) {
    try {
      const patterns: string[] = JSON.parse(blocklistRow.value);
      if (patterns.some((p) => new RegExp(p, "i").test(url))) {
        logger.info("URL blocklisted, skipping", { jobId, url });
        await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
          status: "completed",
          extracted_data: JSON.stringify({ skipped: true, reason: "blocklisted" }),
          updated_at: masterKnex.fn.now(),
        });
        await checkAllPagesDone(jobId);
        return;
      }
    } catch { /* ignore malformed blocklist */ }
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
    const page = await scrapeMarkdown(url, {
      onlyMainContent: true,
      withLinks: true,
      forceFirecrawl: !!forceFirecrawl,
      mobile: !!mobile,
      expandCollapsed: !!expandCollapsed,
      // Retries exist because the first pass came back empty — give the renderer
      // time for the JS-heavy pages that produce most of those.
      ...(forceFirecrawl ? { waitFor: 8000 } : {}),
      ...(proxy ? { proxy } : {}),
    });

    if (page.blocked || page.markdown.length < 50) {
      const reason = page.blocked ? "blocked" : "minimal_content";
      logger.warn("Page blocked or empty", { url, scraper: page.scraper, error: page.error });

      // Route through retry logic instead of silently completing
      const item = await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).select("retry_count", "processing_meta").first();
      const retries = item?.retry_count ?? 0;
      // last_error_detail keeps the real signal (Firecrawl's actual error, or undefined
      // when the call succeeded and content was just thin) — real bug: every one of these
      // was previously bucketed as a generic "blocked", indistinguishable in the DB from an
      // actual anti-bot 403 even when Firecrawl reported success and the page was simply a
      // client-side accordion shell (see expandCollapsed above).
      const meta = {
        ...(item?.processing_meta ?? {}), last_error: reason,
        last_error_detail: page.error ?? null, last_failure_class: "anti_bot" as const,
      };

      // Retry 1: Firecrawl with JS rendering + auto proxy escalation (Firecrawl only
      // pays for its stealth/residential proxy tier if the basic datacenter IP
      // actually gets blocked — free insurance). Retry 2: same, but forced to
      // stealth + mobile emulation — some university-wide WAFs (Akamai/Cloudflare)
      // blackhole datacenter IPs outright and only serve the mobile site.
      // The old `!forceFirecrawl` guard made retry 2 unreachable: the first retry
      // set the flag, so every blocked page died as "after 1 retries".
      // Both retries also click open collapsed accordions/tabs (expandCollapsed) — most
      // of this job's "blocked" pages were never actually blocked, they were JS-accordion
      // shells that no proxy tier could ever fix.
      if (retries < 2) {
        meta.retry_strategy = retries === 0 ? "browser_render" : "mobile";
        const retryProxy = retries === 0 ? "auto" : "stealth";
        await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
          status: "pending", failure_class: "anti_bot", retry_count: retries + 1,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        await queueService.publish(EXTRACTION_QUEUES.PAGES, {
          jobId, queueItemId, url, forceFirecrawl: true, mobile: meta.retry_strategy === "mobile", proxy: retryProxy,
          expandCollapsed: true,
        });
        logger.info("Blocked page re-queued for Firecrawl retry", { url, retries: retries + 1, proxy: retryProxy });
      } else {
        // Exhausted retries — mark failed so it's visible in the admin queue panel
        await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
          status: "failed",
          error: `Page ${reason} after ${retries} retries (${page.scraper})${page.error ? `: ${page.error}` : ""}`,
          failure_class: "anti_bot", retry_count: retries,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_failed", 1);
        await writeJobEvent(jobId, "page_error", {
          level: "warn", phase: "data_extraction",
          message: `Page unreachable after retries: ${url}`,
          data: { url, reason, retries, scraper: page.scraper },
        });
      }
      await checkAllPagesDone(jobId);
      return;
    }

    const markdown = truncateMarkdown(page.markdown);

    // ── Detect if this is a category listing page → queue detail pages instead ──
    // ponytail: check for pagination patterns and category listings before full extraction
    const paginationUrls = detectPaginationUrls(url, page.links, page.markdown);
    if (paginationUrls.length > 0) {
      // Queue paginated siblings we haven't seen yet
      const existingUrls = await masterKnex(`${S}.extraction_queue`)
        .where({ job_id: jobId }).select("url");
      const existingSet = new Set(existingUrls.map((r: { url: string }) => r.url));
      let queued = 0;
      for (const pUrl of paginationUrls) {
        if (!existingSet.has(pUrl)) {
          const newId = await insertQueueItem(jobId, pUrl);
          await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId: newId, url: pUrl });
          queued++;
        }
      }
      if (queued > 0) {
        logger.info("Queued pagination siblings", { url, queued });
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
          total_pages_found: masterKnex.raw("total_pages_found + ?", [queued]),
          pages_total: masterKnex.raw("pages_total + ?", [queued]),
        });
      }
    }

    // ── LLM extraction with memory-augmented prompt ──
    // Same page-worker shape for both source types — only the prompt/system, the shape
    // of what's extracted, and the staging table written to differ. See "Visa service
    // extraction" in extraction-prompts.ts.
    const domain = domainOf(url);
    const isVisaService = job.source_type === "visa_service";
    const memoryStep = isVisaService ? "visa_service_extraction" : "course_extraction";
    const recalled = await recallMemory(domain, memoryStep, markdown.slice(0, 500));
    const addendum = buildSystemAddendum(recalled);

    let entitiesWritten = 0;
    let campusCount = 0;
    let extractedForMemory: unknown;

    if (isVisaService) {
      const system = addendum ? `${VISA_SERVICE_EXTRACTION_SYSTEM}\n\n${addendum}` : VISA_SERVICE_EXTRACTION_SYSTEM;
      const extracted = await extractJson<VisaServiceExtractionResult>({
        system,
        prompt: visaServiceExtractionPrompt(url, markdown, job.guidance_notes, siteIntel),
        maxTokens: 65536,
      });
      extractedForMemory = extracted;

      // Flat table, no child/junction tables — writeVisaService dedups by name per job.
      if (extracted.visa_services?.length) {
        for (const service of extracted.visa_services) {
          if (!service.name) continue;
          await writeVisaService(jobId, { ...service, source_url: service.source_url ?? url });
          entitiesWritten++;
        }
      }
    } else {
      const system = addendum ? `${COURSE_EXTRACTION_SYSTEM}\n\n${addendum}` : COURSE_EXTRACTION_SYSTEM;
      // ponytail: 65536 tokens — listing pages with 50+ courses need room
      const extracted = await extractJson<ExtractionResult>({
        system,
        prompt: courseExtractionPrompt(url, markdown, job.guidance_notes, siteIntel),
        maxTokens: 65536,
      });
      extractedForMemory = extracted;

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
      let secondaryFetches = 0;

      if (extracted.courses?.length) {
        for (const course of extracted.courses) {
          if (!course.name) continue;

          // Upsert campuses mentioned in this course
          if (course.campus_names?.length) {
            for (const cn of course.campus_names) {
              if (!campusIdMap.has(normaliseCampusName(cn))) {
                const cid = await upsertCampus(jobId, { name: cn });
                if (cid) campusIdMap.set(normaliseCampusName(cn), cid);
              }
            }
          }

          // Curriculum usually lives off-page — follow the flagged link whenever one's
          // present, not only when the primary page found zero units: an admissions/
          // overview page often names 1-2 example courses while the dedicated
          // curriculum page lists the full set (seen live: an admissions page named 2
          // of a ~15-course program). Merge rather than replace — writeCourse's
          // upsertStudyUnit already dedups by name, so overlap between the two lists
          // collapses instead of duplicating. Bounded per page scrape, logged when hit.
          if (course.curriculum_page_url) {
            if (secondaryFetches >= SECONDARY_FETCH_CAP) {
              logger.warn("Secondary curriculum-page fetch cap reached, skipping remaining courses", {
                jobId, url, cap: SECONDARY_FETCH_CAP,
              });
            } else {
              secondaryFetches++;
              const units = await fetchCurriculumUnits(course.curriculum_page_url, url, jobId);
              if (units.length) course.study_units = [...(course.study_units ?? []), ...units];
            }
          }

          await writeCourse(jobId, { ...course, source_url: course.source_url ?? url }, campusIdMap);
          entitiesWritten++;
        }
      }
      campusCount = campusIdMap.size;
    }

    // ── Mark complete + update counters ──
    await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
      status: "completed",
      extracted_data: JSON.stringify({ courses_found: entitiesWritten, campuses_found: campusCount, scraper: page.scraper }),
      updated_at: masterKnex.fn.now(),
    });

    if (entitiesWritten > 0) {
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("courses_extracted", entitiesWritten);
    }
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_scraped", 1);

    await writeJobEvent(jobId, "page_extracted", {
      phase: "data_extraction",
      message: `Extracted ${entitiesWritten} ${isVisaService ? "visa services" : "courses"} from ${url}`,
      data: { url, courses: entitiesWritten, campuses: campusCount, scraper: page.scraper },
    });

    // ponytail: feed the learning loop — non-blocking, best-effort
    if (entitiesWritten > 0) {
      rememberMemory({
        job_id: jobId, domain, step: memoryStep,
        entity_type: isVisaService ? "visa_service" : "course", source_url: url,
        source_excerpt: markdown.slice(0, 500),
        ai_output: extractedForMemory,
      }).catch(() => {}); // fire-and-forget
    }

    logger.info("Page processed", { jobId, url, entitiesWritten, scraper: page.scraper });

    await checkAllPagesDone(jobId);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Page processing failed", { jobId, queueItemId, url, error: errMsg });

    // ponytail: V2-style failure classification with retry routing
    const failureClass = classifyFailure(errMsg);
    const item = await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).select("retry_count", "processing_meta").first();
    const retries = item?.retry_count ?? 0;
    const meta = { ...(item?.processing_meta ?? {}), last_error: errMsg, last_failure_class: failureClass };

    let nextStatus = "failed";

    if (failureClass === "anti_bot" && retries < 2) {
      nextStatus = "pending";
      meta.retry_strategy = retries === 0 ? "browser_render" : "mobile";
    } else if (failureClass === "ai_5xx" && retries < 3) {
      nextStatus = "pending";
      meta.retry_strategy = "default";
      meta.retry_after_ms = Math.min(60_000, 1000 * 2 ** retries);
    }

    await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
      status: nextStatus,
      error: nextStatus === "failed" ? errMsg : null,
      failure_class: failureClass,
      retry_count: retries + 1,
      processing_meta: JSON.stringify(meta),
      updated_at: masterKnex.fn.now(),
    });

    if (nextStatus === "pending") {
      // Re-publish for retry with strategy hint
      await queueService.publish(EXTRACTION_QUEUES.PAGES, {
        jobId, queueItemId, url,
        forceFirecrawl: meta.retry_strategy !== "default",
        mobile: meta.retry_strategy === "mobile",
        expandCollapsed: failureClass === "anti_bot",
      });
      logger.info("Re-queued for retry", { jobId, queueItemId, failureClass, retries: retries + 1, strategy: meta.retry_strategy });
    } else {
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_failed", 1);
    }

    await writeJobEvent(jobId, "page_error", {
      level: "error", phase: "data_extraction",
      message: `Failed: ${errMsg} [${failureClass}${nextStatus === "pending" ? ", retrying" : ""}]`,
      data: { url, failure_class: failureClass, retry: nextStatus === "pending" },
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
