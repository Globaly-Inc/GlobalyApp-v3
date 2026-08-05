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
import { looksLikeCourseUrl, filterUrls, truncateMarkdown, domainOf } from "../lib/html-utils.js";
import { extractJson, isConfigured } from "../lib/llm-client.js";
import { siteAnalysisPrompt, urlDiscoveryPrompt, SITE_ANALYSIS_SYSTEM } from "../lib/extraction-prompts.js";
import {
  writeInstitutionOverview,
  writeSiteIntelligence,
  insertQueueItem,
  writeJobEvent,
} from "../lib/staging-writer.js";

const logger = createChildLogger("extraction-job-worker");
const S = "superadmin";

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
  const { jobId, resumed } = JSON.parse(msg!.content.toString());
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
      prompt: siteAnalysisPrompt(job.institution_url, pageText, job.guidance_notes),
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
    const discovery = await discoverUrlsForCrawl(job.institution_url, { limit: 2000 });
    const origin = new URL(job.institution_url).origin;
    let allUrls = filterUrls(discovery.urls, origin);

    await writeJobEvent(jobId, "urls_discovered_raw", {
      phase: "course_discovery",
      message: `Discovered ${allUrls.length} URLs via ${discovery.method}`,
      data: { method: discovery.method, count: allUrls.length },
    });

    // Heuristic filter: keep only URLs that look like course pages
    let courseUrls = allUrls.filter(looksLikeCourseUrl);

    // Add guided URLs from admin
    let guidedUrls: string[] = [];
    if (job.guided_urls) {
      const parsed = typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : job.guided_urls;
      if (Array.isArray(parsed)) guidedUrls = parsed;
      else if (parsed?.urls && Array.isArray(parsed.urls)) guidedUrls = parsed.urls;
      else guidedUrls = Object.values(parsed).filter((v): v is string => typeof v === "string");
    }
    courseUrls = [...new Set([...courseUrls, ...guidedUrls])];

    // If we have too many URLs, let LLM pick the best ones
    if (courseUrls.length > 200) {
      const urlResult = await extractJson<UrlDiscoveryResult>({
        system: SITE_ANALYSIS_SYSTEM,
        prompt: urlDiscoveryPrompt(courseUrls.slice(0, 500), analysis.course_page_patterns),
      });
      courseUrls = [...new Set([...(urlResult.course_urls ?? []), ...guidedUrls])];
    }

    // If heuristic found nothing, send all non-asset URLs to LLM for classification
    if (courseUrls.length === 0 && allUrls.length > 0) {
      const urlResult = await extractJson<UrlDiscoveryResult>({
        system: SITE_ANALYSIS_SYSTEM,
        prompt: urlDiscoveryPrompt(allUrls.slice(0, 500), analysis.course_page_patterns),
      });
      courseUrls = urlResult.course_urls ?? [];
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
    logger.error("Job processing failed", { jobId, error: err });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "pipeline_error", {
      level: "error", phase: "site_mapping", message: err instanceof Error ? err.message : String(err),
    });
  }
});

logger.info(`Extraction job worker started — consuming "${EXTRACTION_QUEUES.JOBS}" queue`);
