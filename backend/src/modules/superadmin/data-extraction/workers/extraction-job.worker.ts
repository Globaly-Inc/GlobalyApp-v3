// Worker — consumes "extraction_jobs" queue.
// Scrapes the institution site, extracts overview via Gemini, discovers course pages,
// and publishes each page to "extraction_pages" for parallel processing.
//
// Run with: npm run job:extraction

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { discoverUrlsForCrawl } from "../lib/scraper.js";
import { SNAPSHOT_BATCH_SIZE } from "../lib/site-snapshot.js";
import { getPage } from "../lib/page-store.js";
import { looksLikeCourseUrl, looksLikeVisaServiceUrl, filterUrls, truncateMarkdown, domainOf, collectGuidedUrls, classifierDistrusted, MIN_CLASSIFIER_KEEP_RATIO } from "../lib/html-utils.js";
import { extractJson, isConfigured, setLlmContext } from "../lib/llm-client.js";
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
  setLlmContext({ jobId, kind: "site_analysis" });

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
    const homepage = await getPage(job.institution_url, { withLinks: true, onlyMainContent: false });

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
    // The prompt's response key is `other_social_urls` (readable in the JSON schema); the DB
    // column is `other_social_links` — rename here rather than in the prompt/schema.
    const { other_social_urls, ...institutionRest } = analysis.institution as Record<string, unknown>;
    await writeInstitutionOverview(jobId, {
      ...institutionRest,
      ...(Array.isArray(other_social_urls) && other_social_urls.length ? { other_social_links: other_social_urls } : {}),
      source_url: job.institution_url,
    } as any);
    await writeSiteIntelligence(jobId, analysis.site_intelligence as any);

    await writeJobEvent(jobId, "site_analyzed", {
      phase: "site_mapping",
      message: "Site analysis complete",
      data: { patterns: analysis.course_page_patterns },
    });

    // ponytail: the "institution" step (extraction-step.worker.ts) does a much better job of this
    // same overview than the homepage-only analysis above — it also scrapes guided_urls.contact_urls
    // (or discovers/guesses a contact page), and non-destructively merges into what's already there.
    // Previously only ran when an admin manually clicked "Re-run" on the Institution tab, so email/
    // phone/address came back null on every fresh job. Auto-dispatch it right after site analysis
    // instead of duplicating its contact-page logic here.
    //
    // "branches" is dispatched by handleInstitutionStep itself once it finishes (not here,
    // alongside "institution") — the branches step falls back to the institution's own phone/
    // email whenever a campus doesn't have its own, and firing both steps at once raced that
    // fallback against the institution step's own writes: branches often finishes faster (fewer
    // pages/LLM calls), reads institution overview before institution step has written email/
    // phone, finds it still empty, and silently has nothing to fall back to. Chaining instead of
    // firing in parallel guarantees the institution row is actually complete first.
    if (!job.source_type || job.source_type === "institution") {
      await queueService.publish(EXTRACTION_QUEUES.STEPS, { jobId, step: "institution" });
    }

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "processing", data_extraction: "waiting", verification: "waiting" }),
      processing_heartbeat_at: masterKnex.fn.now(),
    });

    // ── Phase 2: Discover course page URLs ──
    // Use the full cascade: Firecrawl map → sitemap.xml → page links → seed only
    const discovery = await discoverUrlsForCrawl(job.institution_url, { limit: 10000 });
    const origin = new URL(job.institution_url).origin;
    let allUrls = filterUrls(discovery.urls, origin);

    // Related domains: an admin-curated hint for a multi-campus institution whose country
    // site is a genuinely different registrable domain (monash.edu.my vs monash.edu) — no
    // automated technique reliably links those without a human confirming the match, so this
    // is opt-in config, not discovery. Same table/key shape as the blocklist below.
    const relatedDomainsRow = await masterKnex(`${S}.extraction_additional_info`)
      .where({ job_id: jobId, key: "related_domains" })
      .select("value")
      .first();
    let relatedDomains: string[] = [];
    if (relatedDomainsRow?.value) {
      try {
        // Hand-edited config: an object, bare string or number all PARSE, then either throw on
        // .slice (failing the whole job for a typo) or iterate character by character as bogus
        // domains. Shape-check before use; a malformed row costs its own feature, not the job.
        const parsed: unknown = JSON.parse(relatedDomainsRow.value);
        if (Array.isArray(parsed)) {
          relatedDomains = parsed
            .filter((d): d is string => typeof d === "string")
            .map((d) => d.trim())
            .filter(Boolean);
        } else {
          logger.warn("related_domains is not an array — ignoring", { jobId, got: typeof parsed });
        }
      } catch { /* ignore malformed related-domains config */ }
    }
    // ponytail: cap admin input, not correctness — a typo'd huge list shouldn't multiply a
    // job's discovery cost by accident; bump if a real institution needs more than 10.
    for (const domain of relatedDomains.slice(0, 10)) {
      try {
        const relatedSeed = domain.includes("://") ? domain : `https://${domain}`;
        const relatedDiscovery = await discoverUrlsForCrawl(relatedSeed, { limit: 10000 });
        const relatedUrls = filterUrls(relatedDiscovery.urls, new URL(relatedSeed).origin);
        allUrls = [...new Set([...allUrls, ...relatedUrls])];
        await writeJobEvent(jobId, "related_domain_discovered", {
          phase: "course_discovery",
          message: `Discovered ${relatedUrls.length} URLs from related domain ${domain} via ${relatedDiscovery.method}`,
          data: { domain, method: relatedDiscovery.method, count: relatedUrls.length },
        });
      } catch (err) {
        logger.warn("Related-domain discovery failed", { jobId, domain, err: String(err) });
      }
    }

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

    // Per-source counts, not just a total: each discovery source swallows its own failure as [],
    // so one healthy-looking number can hide the loss of the source that mattered. A zero next to
    // "catalogue" is the difference between "this site has no catalogue" and "we lost 1,335 pages".
    const sourceNote = discovery.sources
      ? ` (${Object.entries(discovery.sources).map(([k, v]) => `${k}: ${v}`).join(", ")})`
      : "";
    await writeJobEvent(jobId, "urls_discovered_raw", {
      phase: "course_discovery",
      level: discovery.sources && Object.values(discovery.sources).some((n) => n === 0) ? "warn" : "info",
      message: `Discovered ${allUrls.length} URLs via ${discovery.method}${sourceNote}`,
      data: { method: discovery.method, count: allUrls.length, sources: discovery.sources ?? null },
    });

    // Site snapshot: every discovered page → .md in GCS, on the step worker so this consumer
    // isn't held for hundreds of scrapes. Bounded by the job's page_cap, same budget as queueing,
    // and split into batches so a crash mid-way loses one batch rather than the whole site.
    const snapshotUrls = allUrls.slice(0, Number(job.page_cap) || 500);
    const batches = Math.ceil(snapshotUrls.length / SNAPSHOT_BATCH_SIZE);
    // Batches are consumed CONCURRENTLY, so no single one knows the step is finished. Each
    // carries the id of THIS dispatch, so the step worker can tell its own run's batch events
    // from those of a dispatch overlapping it — the job worker deliberately tolerates a second
    // message for a job already "processing", so two runs numbering batches 1..N is reachable.
    const runId = randomUUID();
    for (let i = 0; i < batches; i++) {
      await queueService.publish(EXTRACTION_QUEUES.STEPS, {
        jobId, step: "site_snapshot",
        urls: snapshotUrls.slice(i * SNAPSHOT_BATCH_SIZE, (i + 1) * SNAPSHOT_BATCH_SIZE),
        batch: { runId, index: i + 1, total: batches },
      });
    }

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
      const heuristicUrls = courseUrls;
      const picked: string[] = [];
      let batchesDistrusted = 0;
      for (let i = 0; i < heuristicUrls.length; i += LLM_BATCH) {
        const batch = heuristicUrls.slice(i, i + LLM_BATCH);
        const urlResult = await extractJson<UrlDiscoveryResult>({
          system: SITE_ANALYSIS_SYSTEM,
          prompt: buildUrlDiscoveryPrompt(batch, patterns),
          maxTokens: 65536,
          tier: "lite",
        });
        const batchPicked = urlResult.course_urls?.length ? [...new Set(urlResult.course_urls)] : [];
        // Judge EVERY batch against its own input, not just the total. One batch returning nothing
        // while the others do fine leaves the aggregate above the floor, and its whole slice — up
        // to 800 URLs — would be dropped without a trace.
        if (classifierDistrusted(batch.length, batchPicked.length)) {
          batchesDistrusted++;
          picked.push(...batch);
        } else {
          picked.push(...batchPicked);
        }
        // Heartbeat between batches
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
      }
      // This step exists to NARROW a noisy heuristic list, not to replace it wholesale. Live on
      // Yale it returned 154 of 1,363 — keeping 151 catalog.yale.edu pages and discarding ~1,180
      // siblings of identical shape — and because the answer is cached on the exact prompt, every
      // re-run served the same 158 for free and the job looked permanently broken. Same rule the
      // module already applies to scores and partial dates: never silently choose between two
      // stated answers. Keeping the heuristic's URLs is the conservative direction (page_cap still
      // bounds what actually gets queued).
      //
      // No aggregate re-check follows: every batch is already judged against its own input above,
      // so a batch keeping at least the floor means the total does too — an aggregate test here
      // could never fire, and dead code that looks like a safety net is worse than none.
      const distinctPicked = new Set(picked).size;
      if (batchesDistrusted > 0) {
        const totalBatches = Math.ceil(heuristicUrls.length / LLM_BATCH);
        logger.warn("URL-classifier batches returned implausibly few — kept their heuristic URLs", {
          jobId, batchesDistrusted, totalBatches, heuristic: heuristicUrls.length, kept: distinctPicked,
        });
        await writeJobEvent(jobId, "url_classifier_distrusted", {
          level: "warn", phase: "course_discovery",
          message: `${batchesDistrusted} of ${totalBatches} URL-classifier batches returned under the ${Math.round(MIN_CLASSIFIER_KEEP_RATIO * 100)}% floor — kept the heuristic's URLs for those batches (${distinctPicked} of ${heuristicUrls.length} total)`,
          data: {
            batches_distrusted: batchesDistrusted, batches_total: totalBatches,
            heuristic: heuristicUrls.length, kept: distinctPicked, floor: MIN_CLASSIFIER_KEEP_RATIO,
          },
        });
      }
      courseUrls = [...new Set([...guidedUrls, ...picked])];
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
          tier: "lite",
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
    let queued = 0;
    for (const url of courseUrls) {
      const queueItemId = await insertQueueItem(jobId, url);
      if (!queueItemId) continue; // already queued (e.g. duplicate JOBS message) — its owner dispatches it
      await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId, url });
      queued++;
    }

    // Nothing published means nothing advances the job — a re-dispatch whose URLs are all
    // already queued would otherwise sit in "processing" forever.
    // Counts `processing` too: a duplicate job message arriving while pages are still in flight
    // queues nothing and has no pending rows, and calling that idle retires the job to `review`
    // before its pages finish — after which the normal completion path can no longer start
    // verification, leaving it permanently `waiting`.
    const live = await masterKnex(`${S}.extraction_queue`)
      .where({ job_id: jobId }).whereIn("status", ["pending", "processing"]).count({ n: "*" }).first();
    const idle = queued === 0 && Number(live?.n ?? 0) === 0;

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      total_pages_found: courseUrls.length,
      pages_total: courseUrls.length,
      ...(idle ? { status: "review" } : {}),
      pipeline_progress: JSON.stringify({
        site_mapping: "done", course_discovery: "done",
        data_extraction: idle ? "done" : "processing", verification: "waiting",
      }),
      processing_heartbeat_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });

    if (idle) {
      await writeJobEvent(jobId, "discovery_found_nothing_new", {
        level: "warn", phase: "course_discovery",
        message: `Discovery found no pages that weren't already queued (${courseUrls.length} URLs, all known)`,
        data: { method: discovery.method, urls: courseUrls.length },
      });
    }

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
