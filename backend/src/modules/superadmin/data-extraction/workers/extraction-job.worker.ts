// Worker — consumes "extraction_jobs" queue.
// Scrapes the institution site, extracts overview via Gemini, discovers course pages,
// and publishes each page to "extraction_pages" for parallel processing.
//
// Run with: npm run job:extraction

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown, discoverUrlsForCrawl } from "../lib/scraper.js";
import { looksLikeCourseUrl, looksLikeVisaServiceUrl, filterUrls, truncateMarkdown, domainOf, collectGuidedUrls } from "../lib/html-utils.js";
import { extractJson, isConfigured } from "../lib/llm-client.js";
import {
  siteAnalysisPrompt, urlDiscoveryPrompt, SITE_ANALYSIS_SYSTEM,
  visaServiceSiteAnalysisPrompt, visaServiceUrlDiscoveryPrompt,
} from "../lib/extraction-prompts.js";
import {
  writeInstitutionOverview,
  writeSiteIntelligence,
  insertQueueItem,
  writeJobEvent,
} from "../lib/staging-writer.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-job-worker");

interface SiteAnalysisResult {
  institution: Record<string, unknown>;
  site_intelligence: Record<string, unknown>;
  course_page_patterns: string[];
}

interface UrlDiscoveryResult {
  course_urls: string[];
  listing_urls: string[];
}

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

  // Same job/page worker shape as institution jobs, just swapped prompts + URL heuristic +
  // writer target (extraction_visa_services instead of extraction_courses) — see
  // extraction-prompts.ts's "Visa service extraction" section.
  const isVisaService = job.source_type === "visa_service";

  // Mark as processing
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    status: "processing",
    processing_heartbeat_at: masterKnex.fn.now(),
    pipeline_progress: JSON.stringify({ site_mapping: "processing", course_discovery: "waiting", data_extraction: "waiting", verification: "waiting" }),
    updated_at: masterKnex.fn.now(),
  });
  await writeJobEvent(jobId, "pipeline_start", { phase: "site_mapping", message: "Starting site analysis" });

  try {
    // ── Phase 1: Scrape homepage → LLM analysis ──
    const homepage = await scrapeMarkdown(job.institution_url, { withLinks: true, onlyMainContent: true });

    if (!homepage.markdown && homepage.error) {
      throw new Error(`Failed to scrape homepage: ${homepage.error}`);
    }

    await writeJobEvent(jobId, "page_fetched", {
      phase: "site_mapping",
      message: `Scraped homepage via ${homepage.scraper} (${homepage.markdown.length} chars)`,
      data: { scraper: homepage.scraper, chars: homepage.markdown.length },
    });

    // Heartbeat
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });

    // LLM: analyze site
    const pageText = truncateMarkdown(homepage.markdown);
    const analysis = await extractJson<SiteAnalysisResult>({
      system: SITE_ANALYSIS_SYSTEM,
      prompt: isVisaService
        ? visaServiceSiteAnalysisPrompt(job.institution_url, pageText, job.guidance_notes)
        : siteAnalysisPrompt(job.institution_url, pageText, job.guidance_notes),
    });

    // Write institution overview + site intelligence
    await writeInstitutionOverview(jobId, { ...analysis.institution, source_url: job.institution_url } as any);
    await writeSiteIntelligence(jobId, analysis.site_intelligence as any);

    await writeJobEvent(jobId, "site_analyzed", {
      phase: "site_mapping",
      message: "Site analysis complete",
      data: { patterns: analysis.course_page_patterns },
    });

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "processing", data_extraction: "waiting", verification: "waiting" }),
      processing_heartbeat_at: masterKnex.fn.now(),
    });

    // ── Phase 2: Discover course page URLs ──
    // Use the full cascade: Firecrawl map → sitemap.xml → page links → seed only
    const discovery = await discoverUrlsForCrawl(job.institution_url, { limit: 10000 });
    const origin = new URL(job.institution_url).origin;
    let allUrls = filterUrls(discovery.urls, origin);

    // ponytail: apply URL blocklist before heuristic filter
    const blocklistRow = await masterKnex(`${S}.extraction_additional_info`)
      .where({ job_id: jobId, key: "url_blocklist_patterns" })
      .select("value")
      .first();
    let blocklistRegexes: RegExp[] = [];
    if (blocklistRow?.value) {
      try {
        const patterns: string[] = JSON.parse(blocklistRow.value);
        blocklistRegexes = patterns.map((p) => new RegExp(p, "i"));
      } catch { /* ignore malformed blocklist */ }
    }
    if (blocklistRegexes.length > 0) {
      const before = allUrls.length;
      allUrls = allUrls.filter((u) => !blocklistRegexes.some((rx) => rx.test(u)));
      if (before !== allUrls.length) {
        logger.info("Blocklist filtered URLs", { jobId, before, after: allUrls.length });
      }
    }

    await writeJobEvent(jobId, "urls_discovered_raw", {
      phase: "course_discovery",
      message: `Discovered ${allUrls.length} URLs via ${discovery.method}`,
      data: { method: discovery.method, count: allUrls.length },
    });

    // Heuristic filter: keep only URLs that look like course (or visa service) pages
    let courseUrls = allUrls.filter(isVisaService ? looksLikeVisaServiceUrl : looksLikeCourseUrl);

    // Add guided URLs from admin
    const guidedUrls = collectGuidedUrls(
      typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : job.guided_urls,
    );
    courseUrls = [...new Set([...courseUrls, ...guidedUrls])];

    // ponytail: check stop_requested before LLM-heavy URL classification
    const stopCheck1 = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
    if (stopCheck1?.stop_requested) {
      logger.info("Stop requested, aborting", { jobId });
      return;
    }

    // If we have too many URLs, let LLM pick the best ones
    // ponytail: bump maxTokens — response is a URL list that easily exceeds 16K default
    const patterns = analysis.course_page_patterns ?? [];
    const buildUrlDiscoveryPrompt = isVisaService ? visaServiceUrlDiscoveryPrompt : urlDiscoveryPrompt;

    if (courseUrls.length > 500) {
      // ponytail: chunk URLs into batches of 800 for LLM filtering so we don't lose pages
      const LLM_BATCH = 800;
      const classified: string[] = [...guidedUrls];
      for (let i = 0; i < courseUrls.length; i += LLM_BATCH) {
        const batch = courseUrls.slice(i, i + LLM_BATCH);
        const urlResult = await extractJson<UrlDiscoveryResult>({
          system: SITE_ANALYSIS_SYSTEM,
          prompt: buildUrlDiscoveryPrompt(batch, patterns),
          maxTokens: 65536,
        });
        if (urlResult.course_urls?.length) classified.push(...urlResult.course_urls);
        // Heartbeat between batches
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
      }
      courseUrls = [...new Set(classified)];
    }

    // If heuristic found nothing, send all non-asset URLs to LLM for classification
    if (courseUrls.length === 0 && allUrls.length > 0) {
      const LLM_BATCH = 800;
      const classified: string[] = [];
      for (let i = 0; i < allUrls.length && i < 3200; i += LLM_BATCH) {
        const batch = allUrls.slice(i, i + LLM_BATCH);
        const urlResult = await extractJson<UrlDiscoveryResult>({
          system: SITE_ANALYSIS_SYSTEM,
          prompt: buildUrlDiscoveryPrompt(batch, patterns),
          maxTokens: 65536,
        });
        if (urlResult.course_urls?.length) classified.push(...urlResult.course_urls);
      }
      courseUrls = [...new Set(classified)];
    }

    // Fallback: homepage itself
    if (courseUrls.length === 0) courseUrls.push(job.institution_url);

    await writeJobEvent(jobId, "urls_filtered", {
      phase: "course_discovery",
      message: `${courseUrls.length} course pages identified`,
      data: { count: courseUrls.length, sample: courseUrls.slice(0, 10) },
    });

    // ── Phase 3: Queue each page for extraction ──
    for (const url of courseUrls) {
      const queueItemId = await insertQueueItem(jobId, url);
      await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId, url });
    }

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      total_pages_found: courseUrls.length,
      pages_total: courseUrls.length,
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "processing", verification: "waiting" }),
      processing_heartbeat_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });

    logger.info("Job discovery complete", { jobId, method: discovery.method, pages: courseUrls.length });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Job processing failed", { jobId, error: errMsg });
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
