// Worker — consumes "extraction_pages" queue.
// Scrapes a single page to markdown via Crawl4AI/Firecrawl, sends to Gemini
// for structured extraction, writes courses + child entities to staging tables.
//
// Auto-scales via queueService.startScaling.
//
// Run with: npm run job:extraction-pages

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeRenderedHtml } from "../lib/scraper.js";
import { getPage, getDocument, isPdfUrl } from "../lib/page-store.js";
import { truncateMarkdown, domainOf } from "../lib/html-utils.js";
import { courseLinksByName, looksLikeCourseList, parseCourseList } from "../lib/courselist-parser.js";
import { extractJson, setLlmContext, withLlmKind } from "../lib/llm-client.js";
import {
  courseExtractionPrompt, COURSE_EXTRACTION_SYSTEM, studyUnitsFromPagePrompt, STUDY_UNITS_SYSTEM,
  courseDataPrompt, COURSE_DATA_SYSTEM,
  feesFromPagePrompt, FEES_FROM_PAGE_SYSTEM, curriculumAndFeesPrompt, CURRICULUM_AND_FEES_SYSTEM,
  visaServiceExtractionPrompt, VISA_SERVICE_EXTRACTION_SYSTEM,
} from "../lib/extraction-prompts.js";
import {
  writeCourse, upsertCampus, normaliseCampusName, writeVisaService, insertQueueItem, writeJobEvent,
  upsertIntake, type ExtractedIntake, resolveDurationWeeks, durationFromProse, courseOwnPage, bareCourseKey,
  normaliseCourseName,
  type ExtractedCourse, type ExtractedCampus, type ExtractedStudyUnit, type ExtractedFee, type ExtractedVisaService,
} from "../lib/staging-writer.js";
import { loadLookupLists, resolveCountryCode } from "../lib/lookup-catalog.js";
import { checkAllPagesDone } from "../lib/queue-completion.js";
import { recallMemory, rememberMemory, buildSystemAddendum } from "../lib/memory-client.js";
import { classifyFailure, type FailureClass } from "../lib/classify-failure.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-page-worker");

/** Detect paginated sibling pages from links (DataTables, ?page=N, /page/N). */
/**
 * URLs the operator filed under Context -> Intakes, as a set.
 *
 * The courses step already queues these (COURSES_STEP_GUIDED_CATEGORIES in
 * extraction-step.worker.ts), but nothing ever told this worker they were anything other than a
 * course page — so they were extracted with the course prompt and produced nothing.
 */
function intakeGuidedUrls(job: Record<string, unknown>): Set<string> {
  if (!job.guided_urls) return new Set();
  try {
    const guided = typeof job.guided_urls === "string"
      ? JSON.parse(job.guided_urls as string)
      : job.guided_urls as Record<string, unknown>;
    return new Set((guided?.intakes_urls as string[] | undefined) ?? []);
  } catch {
    return new Set();
  }
}

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

interface ExtractionResult {
  courses: ExtractedCourse[];
  campuses_found: ExtractedCampus[];
}

interface VisaServiceExtractionResult {
  visa_services: ExtractedVisaService[];
}

// ponytail: bound worst-case secondary-fetch cost per page scrape (a listing page can
// yield many courses); see docs/data-extraction/2026-08-21-study-units-discovery-design.md
const SECONDARY_FETCH_CAP = 20;

/**
 * A secondary page (curriculum, fees, PDF) through the snapshot store. The curriculum and
 * fees paths commonly resolve to the SAME catalog page, and forty qualification variants
 * across forty queue messages commonly share one handbook — the store serves all of them
 * from one scrape (and, for a PDF, one Gemini Vision read). Failures are never STORED — a
 * WAF block frozen for 30 days would be worse than a retry — but they ARE memoised in
 * `cache` for this one message, so forty variants sharing one dead link cost one attempt
 * and one fetch-cap slot rather than forty paid Vision calls.
 */
async function scrapeSecondaryPage(
  resolvedUrl: string, cache: Map<string, string | null>, jobId: string,
): Promise<string | null> {
  if (cache.has(resolvedUrl)) return cache.get(resolvedUrl)!;
  const md = await fetchSecondaryPage(resolvedUrl, jobId);
  cache.set(resolvedUrl, md);
  return md;
}

async function fetchSecondaryPage(resolvedUrl: string, jobId: string): Promise<string | null> {
  try {
    const page = isPdfUrl(resolvedUrl)
      ? await getDocument(resolvedUrl)
      : await getPage(resolvedUrl, { onlyMainContent: true });
    if (page.blocked || page.markdown.length < 50) {
      logger.warn("Secondary page blocked or empty, skipping fetch", { jobId, url: resolvedUrl, error: page.error });
      return null;
    }
    return truncateMarkdown(page.markdown);
  } catch (err) {
    logger.warn("Secondary page scrape failed, skipping fetch", {
      jobId, url: resolvedUrl, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * A curriculum read straight out of a secondary page's markup, or null when that page does not
 * publish one. Cached per URL like the markdown path, because several qualification variants of
 * one subject share a curriculum link.
 *
 * Tried BEFORE the model on every curriculum page: where the site is a CourseLeaf catalogue the
 * table is exact — code, title, credit hours, requirement block — and it costs no Gemini call
 * at all. Where it is not, this returns null in one fetch and the markdown path runs as before.
 */
async function unitsFromMarkup(
  resolvedUrl: string, cache: Map<string, ExtractedStudyUnit[] | null>, jobId: string,
): Promise<ExtractedStudyUnit[] | null> {
  if (cache.has(resolvedUrl)) return cache.get(resolvedUrl)!;
  let units: ExtractedStudyUnit[] | null = null;
  try {
    const { html } = await scrapeRenderedHtml(resolvedUrl);
    if (html && looksLikeCourseList(html)) {
      const parsed = parseCourseList(html);
      if (parsed.units.length) units = parsed.units;
    }
  } catch (err) {
    logger.warn("Curriculum markup fetch failed, falling back to the model", {
      jobId, url: resolvedUrl, error: err instanceof Error ? err.message : String(err),
    });
  }
  cache.set(resolvedUrl, units);
  return units;
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
  // Metered apart from the page's own extraction: this is the per-COURSE spend, and the one
  // the result cache should collapse across variants that share a handbook page.
  return withLlmKind("secondary", () => extractSecondaryPageInner(opts));
}

async function extractSecondaryPageInner(opts: {
  jobId: string; url: string; markdown: string; courseName: string;
  wantUnits: boolean; wantFees: boolean;
}): Promise<{ study_units: ExtractedStudyUnit[] | null; fees: ExtractedFee[] | null }> {
  try {
    if (opts.wantUnits && opts.wantFees) {
      const result = await extractJson<{ study_units: ExtractedStudyUnit[]; fees: ExtractedFee[] }>({
        system: CURRICULUM_AND_FEES_SYSTEM,
        prompt: curriculumAndFeesPrompt(opts.courseName, opts.url, opts.markdown),
        tier: "lite",
      });
      return { study_units: result.study_units ?? [], fees: result.fees ?? [] };
    }
    if (opts.wantUnits) {
      const result = await extractJson<{ study_units: ExtractedStudyUnit[] }>({
        system: STUDY_UNITS_SYSTEM,
        prompt: studyUnitsFromPagePrompt(opts.url, opts.markdown),
        tier: "lite",
      });
      return { study_units: result.study_units ?? [], fees: null };
    }
    const result = await extractJson<{ fees: ExtractedFee[] }>({
      system: FEES_FROM_PAGE_SYSTEM,
      prompt: feesFromPagePrompt(opts.courseName, opts.url, opts.markdown),
      tier: "lite",
    });
    return { study_units: null, fees: result.fees ?? [] };
  } catch (err) {
    logger.warn("Secondary page extraction failed, skipping", {
      jobId: opts.jobId, url: opts.url, error: err instanceof Error ? err.message : String(err),
    });
    return { study_units: null, fees: null };
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
  setLlmContext({ jobId, kind: "course_extraction" });

  // Check job is still active + load site intelligence hints
  const [job, siteIntel] = await Promise.all([
    masterKnex(`${S}.extraction_jobs`)
      .select("status", "stop_requested", "guidance_notes", "source_type", "degree_level_codes")
      .where({ id: jobId })
      .first(),
    masterKnex(`${S}.extraction_site_intelligence`)
      .select("fee_structure", "extraction_hints", "country")
      .where({ job_id: jobId })
      .orderBy("created_at", "desc")
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
  //
  // attemptToken fences this specific claim: extraction-queue-reclaim.worker.ts clears
  // processing_meta.attempt_token to null the instant it reclaims a "processing" row, and any
  // fresh claim (including by a reclaimed republish) always sets a brand new one. Every write this
  // attempt makes below is conditioned on the token still matching (writeIfOwned), so a worker that
  // was merely slow — not dead — and eventually resumes after being reclaimed and re-processed by
  // someone else finds its own writes silently rejected instead of overwriting a newer, possibly
  // already-terminal, state with stale results.
  // Every claim strips awaiting_publish/retry_after_ms unconditionally, atomically, in the same
  // statement that sets the new token — not just the deferred-retry path's own cleanup. A message
  // being claimed at all means it's no longer "awaiting publish" by definition, no matter how it
  // got here; deriving that from the claim itself (which every consumption already goes through)
  // means there's no separate cleanup step left to race a fast consumer for. A prior design cleared
  // the marker in a follow-up write after publish resolved, which a fast claim could beat — leaving
  // the new attempt's row still tagged, for the reclaim sweep to misread using stale leftover data.
  const attemptToken = randomUUID();
  const claimed = await masterKnex(`${S}.extraction_queue`)
    .where({ id: queueItemId })
    .whereIn("status", ["pending", "failed"])
    .update({
      status: "processing",
      updated_at: masterKnex.fn.now(),
      processing_meta: masterKnex.raw(
        `(coalesce(processing_meta, '{}'::jsonb) - 'awaiting_publish' - 'retry_after_ms') || ?::jsonb`,
        [JSON.stringify({ attempt_token: attemptToken })],
      ),
    });
  if (claimed === 0) {
    logger.info("Queue item already claimed or in a terminal state, skipping duplicate message", { jobId, queueItemId, url });
    return;
  }
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    processing_heartbeat_at: masterKnex.fn.now(),
  });

  // Every extraction_queue write for THIS item, for the rest of this function, must go through
  // this instead of a bare .where({ id: queueItemId }).update(...) — see attemptToken above.
  // Returns false if we've been fenced out; callers must stop rather than act further on the row.
  async function writeIfOwned(update: Record<string, unknown>): Promise<boolean> {
    const n = await masterKnex(`${S}.extraction_queue`)
      .where({ id: queueItemId })
      .whereRaw(`processing_meta->>'attempt_token' = ?`, [attemptToken])
      .update(update);
    return n > 0;
  }

  // Re-checked right after the AI call, before writing any course/campus/intake/visa-service data
  // below — a reclaim can land at any point (it isn't a lock), and this is the cheapest place to
  // catch it: after the one AI call this attempt is ever going to make, but before any of that
  // call's results get committed. Doesn't stop a slow-but-alive attempt from redundantly re-
  // scraping/re-billing a model call once reclaimed (nothing short of a hard lock around the whole
  // attempt could), but does stop it from writing duplicate rows once it's already been superseded.
  async function stillOwned(): Promise<boolean> {
    const row = await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).select("processing_meta").first();
    return row?.processing_meta?.attempt_token === attemptToken;
  }

  try {
    // ── Scrape page to markdown ──
    // The retry ladder (forceFirecrawl) exists because the stored attempt failed or was thin,
    // so it always fetches fresh; a first attempt takes a snapshot within the window.
    const page = await getPage(url, {
      onlyMainContent: true,
      withLinks: true,
      forceFirecrawl: !!forceFirecrawl,
      fresh: !!forceFirecrawl,
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
        const owned = await writeIfOwned({
          status: "pending", failure_class: failureClass, retry_count: retries + 1,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        if (!owned) { logger.info("Fenced out — a newer attempt owns this item, dropping stale retry", { jobId, queueItemId, url }); return; }
        await queueService.publish(EXTRACTION_QUEUES.PAGES, {
          jobId, queueItemId, url, forceFirecrawl: true, mobile: meta.retry_strategy === "mobile", proxy: retryProxy,
          expandCollapsed: true,
        });
        logger.info("Blocked page re-queued for Firecrawl retry", { url, retries: retries + 1, proxy: retryProxy });
      } else {
        // Exhausted retries (or a dead URL that can't benefit from any) — mark failed so
        // it's visible in the admin queue panel with the real reason, not a generic one.
        const owned = await writeIfOwned({
          status: "failed",
          error: page.notFound
            ? `Page does not exist on the source site (404)${page.error ? `: ${page.error}` : ""}`
            : `Page ${reason} after ${retries} retries (${page.scraper})${page.error ? `: ${page.error}` : ""}`,
          failure_class: failureClass, retry_count: retries,
          processing_meta: JSON.stringify(meta), updated_at: masterKnex.fn.now(),
        });
        if (!owned) { logger.info("Fenced out — a newer attempt owns this item, dropping stale failure", { jobId, queueItemId, url }); return; }
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
    // A page the operator filed under Context -> Intakes. An academic calendar is the case this
    // exists for: it states term dates for the whole institution and lists no courses at all, so
    // the course prompt (whose `intakes` live INSIDE each course object) returned an empty courses
    // array and dropped every date on the page. Stanford's calendar is exactly this shape.
    const isIntakeSource = !isVisaService && intakeGuidedUrls(job).has(url);
    const memoryStep = isVisaService
      ? "visa_service_extraction"
      : isIntakeSource ? "intakes" : "course_extraction";
    const recalled = await recallMemory(domain, memoryStep, markdown.slice(0, 500));
    const addendum = buildSystemAddendum(recalled);

    let entitiesWritten = 0;
    let campusCount = 0;
    let overflowQueued = 0;
    let extractedForMemory: unknown;

    if (isIntakeSource) {
      // The FLAT intakes schema, job-scoped — no course wrapper to come up empty.
      const system = addendum ? `${COURSE_DATA_SYSTEM}\n\n${addendum}` : COURSE_DATA_SYSTEM;
      const extracted = await extractJson<{ intakes?: ExtractedIntake[] }>({
        system,
        prompt: courseDataPrompt(url, markdown, "intakes", job.guidance_notes),
        maxTokens: 65536,
      });
      extractedForMemory = extracted;
      if (!(await stillOwned())) { logger.info("Fenced out — a newer attempt owns this item, dropping AI result", { jobId, queueItemId, url }); return; }

      // Deliberately assigned to NO course. upsertIntake is keyed on job + name + month + year, so
      // a calendar's "Autumn 2026-2027" lands on the row 38 courses are already linked to and
      // fills its empty dates — which is the point, and why this needs no name-matching of its
      // own. A term the catalogue never mentioned becomes an unlinked intake: visible in the admin
      // tab for someone to link, and excluded from public reads until they do (those read through
      // the assignment junction).
      for (const intake of extracted.intakes ?? []) {
        if (!intake.intake_name && !intake.start_date) continue;
        await upsertIntake(jobId, intake, url);
        entitiesWritten++;
      }
    } else if (isVisaService) {
      const system = addendum ? `${VISA_SERVICE_EXTRACTION_SYSTEM}\n\n${addendum}` : VISA_SERVICE_EXTRACTION_SYSTEM;
      const extracted = await extractJson<VisaServiceExtractionResult>({
        system,
        prompt: visaServiceExtractionPrompt(url, markdown, job.guidance_notes, siteIntel),
        maxTokens: 65536,
      });
      extractedForMemory = extracted;
      if (!(await stillOwned())) { logger.info("Fenced out — a newer attempt owns this item, dropping AI result", { jobId, queueItemId, url }); return; }

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
        // The model picks the degree level and area of study from the platform's live lists
        // (seeded, read once per process) — see lib/lookup-catalog.ts.
        prompt: courseExtractionPrompt(
          url, markdown, job.guidance_notes, siteIntel, await loadLookupLists(),
          job.degree_level_codes ?? undefined,
        ),
        maxTokens: 65536,
      });
      extractedForMemory = extracted;
      if (!(await stillOwned())) { logger.info("Fenced out — a newer attempt owns this item, dropping AI result", { jobId, queueItemId, url }); return; }

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
      // Secondary pages already attempted in THIS message, failures included (null). The
      // snapshot store underneath outlives the message but never stores a failure; this map
      // is what stops a shared dead link from being retried — and charged to the cap — once
      // per qualification variant.
      const secondaryPageCache = new Map<string, string | null>();
      // A URL already in the memo costs no fetch, so the cap must not turn it away: past
      // the cap a cached curriculum/fees page is still reused rather than overflowed.
      const fetchable = (u: string | null | undefined): u is string =>
        !!u && (secondaryPageCache.has(u) || secondaryFetches < SECONDARY_FETCH_CAP);
      // Units parsed from a secondary page's markup (null = that page publishes no table).
      const markupCache = new Map<string, ExtractedStudyUnit[] | null>();

      // ── Curriculum straight from the markup, when the site publishes one ──
      // CourseLeaf catalogues (Johns Hopkins, Georgia Tech and much of the US sector) render a
      // programme's curriculum as `table.sc_courselist` — code, title, credit hours, under a
      // named requirement block. The model never sees it: JHU renders its whole catalogue
      // navigation tree inline, so one programme page comes out as ~155,000 characters of
      // links with the curriculum past the truncation point and the tables not converted at
      // all, and every JHU course was staged with zero study units while 42 rows of real
      // curriculum sat in the page.
      //
      // So the HTML is fetched ONCE per page, and only when the model actually left a course
      // without units — a page that already yielded a curriculum costs nothing extra. Two
      // things come out of it: the units for a course whose own page this is, and the
      // per-programme links for an index page, which is how a course reaches its own
      // curriculum when the model flagged no curriculum_page_url.
      let pageUnits: ExtractedStudyUnit[] = [];
      let pageCourseLinks: Map<string, string> = new Map();
      if (extracted.courses?.some((c) => c.name && !c.study_units?.length)) {
        const { html: pageHtml } = await scrapeRenderedHtml(url);
        if (pageHtml && looksLikeCourseList(pageHtml)) {
          pageUnits = parseCourseList(pageHtml).units;
        }
        if (pageHtml) pageCourseLinks = courseLinksByName(pageHtml, url);
        if (pageUnits.length || pageCourseLinks.size) {
          logger.info("Parsed curriculum markup", {
            jobId, url, units: pageUnits.length, links: pageCourseLinks.size,
          });
        }
      }

      // Which bare names more than one course on this page would claim. "CS (Bachelor)" and
      // "CS (Master)" both reduce to "cs", and the index's single "CS" anchor belongs to at most
      // one of them — so the fallback refuses it for both rather than staging one's curriculum
      // and duration onto the other.
      const bareClaims = new Map<string, number>();
      for (const c of extracted.courses ?? []) {
        const key = c.name ? (bareCourseKey(c.name) ?? normaliseCourseName(c.name)) : null;
        if (key) bareClaims.set(key, (bareClaims.get(key) ?? 0) + 1);
      }
      const contestedBareNames = new Set(
        [...bareClaims].filter(([, n]) => n > 1).map(([key]) => key),
      );

      if (extracted.courses?.length) {
        for (const course of extracted.courses) {
          if (!course.name) continue;

          // This page's own curriculum table belongs to the course this page is ABOUT. A page
          // describing several courses (a listing) gets its units from each course's own page
          // below instead, so the same table is never handed to every course on an index.
          if (!course.study_units?.length && pageUnits.length && extracted.courses.length === 1) {
            course.study_units = pageUnits;
          }

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
          // The model flagged nothing, but the page links this very programme by name — the
          // ordinary case on a catalogue index, and the reason 18 of 19 JHU courses had no
          // curriculum. Only when the course still has no units, so a page that already
          // produced one is never re-fetched.
          if (!currUrl && !course.study_units?.length) {
            const own = courseOwnPage(pageCourseLinks, course.name, contestedBareNames);
            if (own && own !== url) currUrl = own;
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

          // Markup before the model. When the curriculum page is a CourseLeaf catalogue this
          // settles the units exactly and spends no Gemini call; `currUrl` is then cleared so
          // the branches below only run for a fees need.
          if (currUrl && secondaryFetches < SECONDARY_FETCH_CAP) {
            const parsed = await unitsFromMarkup(currUrl, markupCache, jobId);
            if (parsed?.length) {
              secondaryFetches++;
              curriculumCache.set(currUrl, parsed);
              course.study_units = [...(course.study_units ?? []), ...parsed];
              logger.info("Units from curriculum markup", {
                jobId, course: course.name, url: currUrl, units: parsed.length,
              });
              currUrl = null;
            }
          }

          if (currUrl || feesUrl) {
            if (!fetchable(currUrl ?? feesUrl)) {
              // Past the cap the course's own page becomes a queue item rather than being
              // dropped, so each gets a full secondary budget. page_cap still bounds the total.
              const own = currUrl ?? feesUrl;
              if (own) {
                const queued = await insertQueueItem(jobId, own);
                if (queued) {
                  await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId: queued, url: own });
                  overflowQueued++;
                }
              }
            } else if (currUrl && currUrl === feesUrl) {
              // Both point at the same page — one scrape, ONE combined Gemini call.
              if (!secondaryPageCache.has(currUrl)) secondaryFetches++;
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
                if (!secondaryPageCache.has(currUrl)) secondaryFetches++;
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
              if (fetchable(feesUrl)) {
                if (!secondaryPageCache.has(feesUrl)) secondaryFetches++;
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

          if (resolveDurationWeeks(course) == null) {
            const ownUrl = courseOwnPage(pageCourseLinks, course.name, contestedBareNames);
            if (ownUrl && ownUrl !== url && fetchable(ownUrl)) {
              if (!secondaryPageCache.has(ownUrl)) secondaryFetches++;
              const md = await scrapeSecondaryPage(ownUrl, secondaryPageCache, jobId);
              const stated = md ? durationFromProse(md) : null;
              if (stated) {
                course.duration_text = `${stated.value} ${stated.unit}`;
                logger.info("Duration from course page", {
                  jobId, course: course.name, url: ownUrl, duration: course.duration_text,
                });
              }
            }
          }

          const written = await writeCourse(jobId, {
            ...course,
            source_url: course.source_url ?? url,
            // From site intelligence, never the model — one country per job, resolved to the ISO2
            // the public search joins on. See lookup-catalog.resolveCountryCode.
            country_code: await resolveCountryCode(siteIntel?.country),
          }, campusIdMap);
          if (written) entitiesWritten++;
        }
      }
      campusCount = campusIdMap.size;
    }

    // ── Mark complete + update counters ──
    // Fenced: if a reclaim has since republished and a newer attempt already finished (or is
    // still running) this same item, writeIfOwned is a no-op here and everything below — the
    // counters, job event, and checkAllPagesDone — is skipped rather than double-counted or run
    // against a state a newer attempt already owns.
    const owned = await writeIfOwned({
      status: "completed",
      extracted_data: JSON.stringify({ courses_found: entitiesWritten, campuses_found: campusCount, scraper: page.scraper, from_snapshot: page.fromCache }),
      page_id: page.pageId,
      page_content_hash: page.contentHash,
      updated_at: masterKnex.fn.now(),
    });
    if (!owned) {
      logger.info("Fenced out — a newer attempt owns this item, dropping stale completion", { jobId, queueItemId, url });
      return;
    }

    if (entitiesWritten > 0) {
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("courses_extracted", entitiesWritten);
    }
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).increment("pages_scraped", 1);

    if (overflowQueued > 0) {
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
        total_pages_found: masterKnex.raw("total_pages_found + ?", [overflowQueued]),
        pages_total: masterKnex.raw("pages_total + ?", [overflowQueued]),
      });
    }

    await writeJobEvent(jobId, "page_extracted", {
      phase: "data_extraction",
      message: `Extracted ${entitiesWritten} ${isVisaService ? "visa services" : "courses"} from ${url}`,
      data: {
        url, courses: entitiesWritten, campuses: campusCount, scraper: page.scraper,
        ...(overflowQueued ? { queued_for_curriculum: overflowQueued } : {}),
      },
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

    logger.info("Page processed", { jobId, url, entitiesWritten, overflowQueued, scraper: page.scraper });

    await checkAllPagesDone(jobId);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Page processing failed", { jobId, queueItemId, url, error: errMsg });

    // ponytail: V2-style failure classification with retry routing
    const failureClass = classifyFailure(errMsg);
    const item = await masterKnex(`${S}.extraction_queue`).where({ id: queueItemId }).select("retry_count", "processing_meta").first();
    const retries = item?.retry_count ?? 0;
    const meta: Record<string, unknown> = { ...(item?.processing_meta ?? {}), last_error: errMsg, last_failure_class: failureClass };

    let nextStatus = "failed";
    // llm-client's withRetry tags a provider-mandated wait too long to safely block a worker slot
    // on (see INLINE_RETRY_CEILING_MS there) with the real, never-truncated delay it asked for.
    const deferredMatch = errMsg.match(/retry_after_ms=(\d+)/);
    const deferredMs = deferredMatch ? Number(deferredMatch[1]) : null;

    if (failureClass === "anti_bot" && retries < 2) {
      nextStatus = "pending";
      meta.retry_strategy = retries === 0 ? "browser_render" : "mobile";
    } else if (failureClass === "ai_5xx" && retries < 3) {
      nextStatus = "pending";
      meta.retry_strategy = "default";
      if (deferredMs != null) {
        // Released, not held: status goes to "pending" now instead of misrepresenting this as
        // "processing" for however long the provider's throttle lasts. awaiting_publish marks it
        // recoverable by extraction-queue-reclaim.worker.ts's pending-sweep if this process dies
        // before the deferred republish below actually fires.
        meta.awaiting_publish = true;
        meta.retry_after_ms = deferredMs;
      }
    }

    const owned = await writeIfOwned({
      status: nextStatus,
      error: nextStatus === "failed" ? errMsg : null,
      failure_class: failureClass,
      retry_count: retries + 1,
      processing_meta: JSON.stringify(meta),
      updated_at: masterKnex.fn.now(),
    });
    if (!owned) {
      logger.info("Fenced out — a newer attempt owns this item, dropping stale failure/retry", { jobId, queueItemId, url });
      return;
    }

    if (nextStatus === "pending") {
      const publishOpts = {
        jobId, queueItemId, url,
        forceFirecrawl: meta.retry_strategy !== "default",
        mobile: meta.retry_strategy === "mobile",
        expandCollapsed: failureClass === "anti_bot",
      };
      if (meta.awaiting_publish) {
        // In-process deferred retry, not an immediate republish — .unref() so this timer never
        // blocks a graceful shutdown; if the process exits before it fires, the row is left
        // "pending" + awaiting_publish for the reclaim sweep to pick up instead.
        logger.info("Deferred retry scheduled (provider rate limit)", { jobId, queueItemId, retryAfterMs: deferredMs, retries: retries + 1 });
        setTimeout(() => {
          // Detached and unawaited: nothing consumes this chain's result, so EVERY failure inside
          // it — including the recovery write in the catch block below — must be caught here.
          // Letting any of it reject unhandled would crash the whole page-worker process under
          // Node's default unhandled-rejection behaviour, taking down every other in-flight page
          // over what should at worst be one item staying stuck a bit longer.
          (async () => {
            try {
              await queueService.publish(EXTRACTION_QUEUES.PAGES, publishOpts);
              // NOT responsible for clearing awaiting_publish/retry_after_ms — the claim itself
              // does that atomically the moment anyone actually claims this message (see the claim
              // query above), so there's no separate cleanup step here for a fast consumer to race.
              // This is just a best-effort updated_at refresh for the case where the message is
              // still sitting unclaimed in a busy queue: if writeIfOwned finds 0 rows, a consumer
              // already claimed it (and thus already cleared the marker as part of claiming) —
              // nothing to do, not an error.
              await writeIfOwned({ updated_at: masterKnex.fn.now() });
            } catch (e) {
              logger.error("Deferred retry publish failed", { queueItemId, error: e instanceof Error ? e.message : String(e) });
              try {
                await writeIfOwned({
                  processing_meta: masterKnex.raw(`coalesce(processing_meta, '{}'::jsonb) || '{"awaiting_publish":true,"retry_after_ms":0}'::jsonb`),
                  updated_at: masterKnex.fn.now(),
                });
              } catch (e2) {
                logger.error("Deferred retry recovery write also failed — leaving row for the reclaim sweep", {
                  queueItemId, error: e2 instanceof Error ? e2.message : String(e2),
                });
              }
            }
          })();
        }, deferredMs!).unref();
      } else {
        // Re-publish for retry with strategy hint
        await queueService.publish(EXTRACTION_QUEUES.PAGES, publishOpts);
        logger.info("Re-queued for retry", { jobId, queueItemId, failureClass, retries: retries + 1, strategy: meta.retry_strategy });
      }
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
