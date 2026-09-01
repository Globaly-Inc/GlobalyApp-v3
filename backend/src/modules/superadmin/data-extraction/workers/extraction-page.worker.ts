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
  feesFromPagePrompt, FEES_FROM_PAGE_SYSTEM, curriculumAndFeesPrompt, CURRICULUM_AND_FEES_SYSTEM,
  visaServiceExtractionPrompt, VISA_SERVICE_EXTRACTION_SYSTEM,
} from "../lib/extraction-prompts.js";
import {
  writeCourse, upsertCampus, normaliseCampusName, writeVisaService, insertQueueItem, writeJobEvent,
  type ExtractedCourse, type ExtractedCampus, type ExtractedStudyUnit, type ExtractedFee, type ExtractedVisaService,
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
type FailureClass = "anti_bot" | "not_found" | "not_a_course" | "ai_5xx" | "parse_error" | "other";

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
 * Scrape a secondary page at most once per page message — the curriculum and fees paths
 * commonly resolve to the SAME catalog page (see the fees fallback in the course loop),
 * and without this cache that page was scraped and billed once per path per course
 * variant. Failures are cached too (null): re-scraping an identical URL seconds later
 * in the same message costs money and almost never recovers.
 */
async function scrapeSecondaryPage(resolvedUrl: string, cache: Map<string, string | null>, jobId: string): Promise<string | null> {
  if (cache.has(resolvedUrl)) return cache.get(resolvedUrl)!;
  let markdown: string | null = null;
  try {
    const page = await scrapeMarkdown(resolvedUrl, { onlyMainContent: true });
    if (!page.blocked && page.markdown.length >= 50) {
      markdown = truncateMarkdown(page.markdown);
    } else {
      logger.warn("Secondary page blocked or empty, skipping fetch", { jobId, url: resolvedUrl });
    }
  } catch (err) {
    logger.warn("Secondary page scrape failed, skipping fetch", {
      jobId, url: resolvedUrl, error: err instanceof Error ? err.message : String(err),
    });
  }
  cache.set(resolvedUrl, markdown);
  return markdown;
}

/**
 * One Gemini call per secondary-page need — units, fees, or BOTH in a single combined
 * call when the same page serves both (the catalog case that motivated fees discovery);
 * two calls over identical page content was pure duplicate input-token billing.
 * A null field means that extraction FAILED (possibly transiently — the caller must not
 * cache it; a later variant sharing the URL may retry); an array (even empty) is a real
 * extraction result. Never throws — a secondary fetch must never fail the course write.
 */
async function extractSecondaryPage(opts: {
  jobId: string; url: string; markdown: string; courseName: string;
  wantUnits: boolean; wantFees: boolean;
}): Promise<{ study_units: ExtractedStudyUnit[] | null; fees: ExtractedFee[] | null }> {
  try {
    if (opts.wantUnits && opts.wantFees) {
      const result = await extractJson<{ study_units: ExtractedStudyUnit[]; fees: ExtractedFee[] }>({
        system: CURRICULUM_AND_FEES_SYSTEM,
        prompt: curriculumAndFeesPrompt(opts.courseName, opts.url, opts.markdown),
      });
      return { study_units: result.study_units ?? [], fees: result.fees ?? [] };
    }
    if (opts.wantUnits) {
      const result = await extractJson<{ study_units: ExtractedStudyUnit[] }>({
        system: STUDY_UNITS_SYSTEM,
        prompt: studyUnitsFromPagePrompt(opts.url, opts.markdown),
      });
      return { study_units: result.study_units ?? [], fees: null };
    }
    const result = await extractJson<{ fees: ExtractedFee[] }>({
      system: FEES_FROM_PAGE_SYSTEM,
      prompt: feesFromPagePrompt(opts.courseName, opts.url, opts.markdown),
    });
    return { study_units: null, fees: result.fees ?? [] };
  } catch (err) {
    logger.warn("Secondary page extraction failed, skipping", {
      jobId: opts.jobId, url: opts.url, error: err instanceof Error ? err.message : String(err),
    });
    return { study_units: null, fees: null };
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

  // Atomically claim the item. Every producer (job worker, courses/discovery steps, retries,
  // overlapping reruns) publishes after flipping the row to "pending", so duplicate messages
  // for the same item — e.g. two admins hitting Rerun at once, each re-dispatching the same
  // pending/failed pages — die here instead of double-scraping and double-billing Gemini.
  // Also honours a pause/stop that landed between publish and consume.
  const claimed = await masterKnex(`${S}.extraction_queue`)
    .where({ id: queueItemId })
    .whereIn("status", ["pending", "failed"])
    .update({ status: "processing", updated_at: masterKnex.fn.now() });
  if (claimed === 0) {
    logger.info("Queue item already claimed or in a terminal state, skipping duplicate message", { jobId, queueItemId, url });
    return;
  }
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
      const reason = page.notFound ? "not_found" : page.blocked ? "blocked" : "minimal_content";
      const failureClass: FailureClass = page.notFound ? "not_found" : "anti_bot";
      logger.warn("Page blocked, not found, or empty", { url, scraper: page.scraper, error: page.error });

      // Route through retry logic instead of silently completing
      const item = await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).select("retry_count", "processing_meta").first();
      const retries = item?.retry_count ?? 0;
      // last_error_detail keeps the real signal (Firecrawl's actual error, or undefined
      // when the call succeeded and content was just thin) — real bug: every one of these
      // was previously bucketed as a generic "blocked", indistinguishable in the DB from an
      // actual anti-bot 403 even when Firecrawl reported success and the page was simply a
      // client-side accordion shell (see expandCollapsed above) or the source URL is just dead.
      const meta = {
        ...(item?.processing_meta ?? {}), last_error: reason,
        last_error_detail: page.error ?? null, last_failure_class: failureClass,
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
      // A not_found page skips retries entirely — every proxy/mobile tier hits the exact
      // same 404 on the source site, so retrying only delays the (unchanged) failure.
      if (!page.notFound && retries < 2) {
        meta.retry_strategy = retries === 0 ? "browser_render" : "mobile";
        const retryProxy = retries === 0 ? "auto" : "stealth";
        await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
          status: "pending", failure_class: failureClass, retry_count: retries + 1,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        await queueService.publish(EXTRACTION_QUEUES.PAGES, {
          jobId, queueItemId, url, forceFirecrawl: true, mobile: meta.retry_strategy === "mobile", proxy: retryProxy,
          expandCollapsed: true,
        });
        logger.info("Blocked page re-queued for Firecrawl retry", { url, retries: retries + 1, proxy: retryProxy });
      } else {
        // Exhausted retries (or a dead URL that can't benefit from any) — mark failed so
        // it's visible in the admin queue panel with the real reason, not a generic one.
        await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).update({
          status: "failed",
          error: page.notFound
            ? `Page does not exist on the source site (404)${page.error ? `: ${page.error}` : ""}`
            : `Page ${reason} after ${retries} retries (${page.scraper})${page.error ? `: ${page.error}` : ""}`,
          failure_class: failureClass, retry_count: retries,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_failed", 1);
        await writeJobEvent(jobId, "page_error", {
          level: "warn", phase: "data_extraction",
          message: page.notFound ? `Page does not exist on source site: ${url}` : `Page unreachable after retries: ${url}`,
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
          if (!newId) continue; // a parallel page worker already queued this sibling
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
      // A page listing one subject as several qualification variants (BEng/MEng/BSc —
      // see extraction-prompts.ts's "extract one course object per variant" rule) commonly
      // points every variant at the same shared curriculum link. Without this cache each
      // variant re-scraped and re-billed Gemini for the identical URL, up to SECONDARY_FETCH_CAP
      // times per page for what was really one page's worth of content.
      const curriculumCache = new Map<string, ExtractedStudyUnit[]>();
      // Scraped markdown per secondary URL (null = failed/blocked) — the fees fallback
      // usually points at the very page curriculum discovery just scraped.
      const secondaryPageCache = new Map<string, string | null>();

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
          let currUrl: string | null = null;
          if (course.curriculum_page_url) {
            try { currUrl = new URL(course.curriculum_page_url, url).toString(); }
            catch { logger.warn("Invalid curriculum_page_url, skipping secondary fetch", { jobId, url, curriculumUrl: course.curriculum_page_url }); }
          }

          // Fees usually live on the primary page; when they don't, the LLM flags a link
          // to the course's own fees/tuition/catalog page instead of fabricating a figure.
          // A university catalog entry (e.g. Acalog) commonly bundles curriculum AND fees
          // on the SAME page — its anchor text often reads "degree requirements", so the
          // LLM flags it as curriculum_page_url only, never a separate fees_page_url. Fall
          // back to that page too, not just an explicit fees_page_url. Only worth trying
          // when fees are still empty — unlike curriculum, a correct fee already found on
          // the primary page shouldn't be risked for a duplicate.
          let feesUrl: string | null = null;
          const feesRaw = course.fees?.length ? null : (course.fees_page_url || course.curriculum_page_url);
          if (feesRaw) {
            try { feesUrl = new URL(feesRaw, url).toString(); }
            catch { logger.warn("Invalid fees_page_url, skipping secondary fetch", { jobId, url, feesUrl: feesRaw }); }
          }

          // Units an earlier variant already extracted from this URL — reuse, don't re-bill.
          if (currUrl && curriculumCache.has(currUrl)) {
            const cached = curriculumCache.get(currUrl)!;
            if (cached.length) course.study_units = [...(course.study_units ?? []), ...cached];
            currUrl = null;
          }

          if (currUrl || feesUrl) {
            if (secondaryFetches >= SECONDARY_FETCH_CAP) {
              logger.warn("Secondary fetch cap reached, skipping remaining courses", {
                jobId, url, cap: SECONDARY_FETCH_CAP,
              });
            } else if (currUrl && currUrl === feesUrl) {
              // Both point at the same page — one scrape, ONE combined Gemini call.
              secondaryFetches++;
              const md = await scrapeSecondaryPage(currUrl, secondaryPageCache, jobId);
              if (md) {
                const r = await extractSecondaryPage({
                  jobId, url: currUrl, markdown: md, courseName: course.name, wantUnits: true, wantFees: true,
                });
                // null = failed extraction — leave it uncached so a later variant
                // sharing this URL gets its own retry instead of inheriting the failure.
                if (r.study_units !== null) {
                  curriculumCache.set(currUrl, r.study_units);
                  if (r.study_units.length) course.study_units = [...(course.study_units ?? []), ...r.study_units];
                }
                if (r.fees?.length) course.fees = r.fees;
              }
            } else {
              if (currUrl) {
                secondaryFetches++;
                const md = await scrapeSecondaryPage(currUrl, secondaryPageCache, jobId);
                if (md) {
                  const r = await extractSecondaryPage({
                    jobId, url: currUrl, markdown: md, courseName: course.name, wantUnits: true, wantFees: false,
                  });
                  if (r.study_units !== null) {
                    curriculumCache.set(currUrl, r.study_units);
                    if (r.study_units.length) course.study_units = [...(course.study_units ?? []), ...r.study_units];
                  }
                }
              }
              if (feesUrl && secondaryFetches < SECONDARY_FETCH_CAP) {
                secondaryFetches++;
                const md = await scrapeSecondaryPage(feesUrl, secondaryPageCache, jobId);
                if (md) {
                  const r = await extractSecondaryPage({
                    jobId, url: feesUrl, markdown: md, courseName: course.name, wantUnits: false, wantFees: true,
                  });
                  if (r.fees?.length) course.fees = r.fees;
                }
              }
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
