// The one-step-at-a-time chain: site_map → site_snapshot → site_analysis → url_classify →
// queue_pages (docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md).
//
// Each step runs to completion, writes its result to a table, and stops. The next step reads only
// that table. The ONLY step that scrapes pages is site_snapshot; site_analysis, url_classify and
// queue_pages read extraction_pages / extraction_site_urls and never touch the network (the
// homepage is the one exception noted in runSiteAnalysis). The gate between steps is one column,
// extraction_jobs.step_mode: 'auto' publishes the successor, 'manual' marks it "waiting" for the
// admin's Run button. Every handler here used to be a stretch of extraction-job.worker.ts; the
// logic is moved, not rewritten.

import { randomUUID } from "node:crypto";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { NEXT_STEP, type PipelineStep } from "../schemas/step.schema.js";
import { discoverUrlsForCrawl } from "./scraper.js";
import { SNAPSHOT_BATCH_SIZE } from "./site-snapshot.js";
import { getPage, normaliseUrl, readSnapshot } from "./page-store.js";
import {
  looksLikeCourseUrl, looksLikeVisaServiceUrl, filterUrls, truncateMarkdown, collectGuidedUrls, compileBlocklist,
  classifierDistrusted, MIN_CLASSIFIER_KEEP_RATIO,
} from "./html-utils.js";
import { extractJson } from "./llm-client.js";
import {
  siteAnalysisPrompt, urlDiscoveryPrompt, urlCategoryPrompt, SITE_ANALYSIS_SYSTEM,
  visaServiceSiteAnalysisPrompt, visaServiceUrlDiscoveryPrompt,
} from "./extraction-prompts.js";
import { writeInstitutionOverview, writeSiteIntelligence, insertQueueItemDetailed, writeJobEvent } from "./staging-writer.js";
import {
  upsertSiteUrls, listActiveSiteUrls, listSiteUrlsByCategory, setSiteUrlCategories,
} from "../repositories/site-urls.repository.js";
import { SITE_URL_CATEGORIES, categoriesFor, guidedUrlCategories, type CategoryVerdict, type SiteUrlCategory } from "./url-categories.js";

const logger = createChildLogger("pipeline-steps");

type JobRow = Record<string, any>;

interface SiteAnalysisResult {
  institution: Record<string, unknown>;
  site_intelligence: Record<string, unknown>;
  course_page_patterns: string[];
}

interface UrlDiscoveryResult {
  course_urls: string[];
  listing_urls: string[];
}

interface UrlCategoryResult {
  categories: Partial<Record<SiteUrlCategory, string[]>>;
}

// ── Test seam: the job row, the queue, progress and the timeline ──
export const _stepDeps = {
  loadJob: async (jobId: string): Promise<JobRow | undefined> => masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first(),
  publish: async (queue: string, payload: Record<string, unknown>): Promise<void> => { await queueService.publish(queue, payload); },
  // ONE atomic jsonb merge, never read-modify-write: snapshot batches land concurrently and the
  // successor hand-off writes in the same window, so two readers of the whole blob overwrite each
  // other and a freshly written "site_analysis: processing" vanishes while its message is already
  // in flight. Same shape as queue-completion.ts and the verify worker.
  setProgress: async (jobId: string, patch: Record<string, string>): Promise<void> => {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      pipeline_progress: masterKnex.raw("coalesce(pipeline_progress, '{}'::jsonb) || ?::jsonb", [JSON.stringify(patch)]),
      processing_heartbeat_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });
  },
  writeEvent: (jobId: string, kind: string, opts?: Parameters<typeof writeJobEvent>[2]) => writeJobEvent(jobId, kind, opts),
};

export const setProgress = (jobId: string, patch: Record<string, string>) => _stepDeps.setProgress(jobId, patch);

// ── The gate ────────────────────────────────────────────────────────────────

/**
 * May the step after `from` run now? Returns the successor's name when it may, null when the
 * chain must pause (manual mode, a stop request, a job that is paused/failed/declined) or `from`
 * has no successor. The caller publishes
 * — site_map needs to publish snapshot BATCHES, not one message, so publishing is not done here.
 */
export async function gate(jobId: string, from: PipelineStep): Promise<PipelineStep | null> {
  const step = NEXT_STEP[from];
  if (!step) return null;
  const job = await _stepDeps.loadJob(jobId);
  if (!job) return null;
  // Same set the snapshot's own halt check uses. A batch can still complete AFTER the admin paused
  // (the halt check runs every 25 pages), so the pause has to be honoured here too or the chain
  // continues with an incomplete snapshot.
  const halted = ["paused", "failed", "declined"].includes(job.status);
  if (job.stop_requested || halted || job.step_mode === "manual") {
    const reason = job.stop_requested ? "stop_requested" : halted ? job.status : "manual";
    await _stepDeps.setProgress(jobId, { [step]: "waiting" });
    await _stepDeps.writeEvent(jobId, "step_waiting", {
      phase: step,
      message: reason === "manual" ? `Waiting for admin to run ${step} (manual step mode)` : `Stopped before ${step} (job ${reason})`,
      data: { step, reason },
    });
    return null;
  }
  return step;
}

/** gate() plus the one-message publish every step but site_map wants. */
export async function advance(jobId: string, from: PipelineStep, payload: Record<string, unknown> = {}): Promise<"published" | "waiting" | "none"> {
  if (!NEXT_STEP[from]) return "none";
  const step = await gate(jobId, from);
  if (!step) return "waiting";
  await _stepDeps.setProgress(jobId, { [step]: "processing" });
  await _stepDeps.publish(EXTRACTION_QUEUES.STEPS, { jobId, step, ...payload });
  return "published";
}

// ── Pure helpers (tested in tests/step-gate.ts) ─────────────────────────────

/**
 * One classifier batch, merged. A pick counts only when it is verbatim one of the batch's URLs —
 * the prompt now shows the model a page excerpt beside each URL, and a model that echoes the
 * excerpt back must not turn into "the batch returned nothing". A distrusted batch (see
 * classifierDistrusted) keeps the heuristic's URLs; this step exists to NARROW, never to empty.
 */
export function mergeClassifierBatch(batch: string[], picked: string[]): Set<string> {
  const inBatch = new Set(batch);
  const kept = new Set(picked.map((p) => p.trim()).filter((p) => inBatch.has(p)));
  return classifierDistrusted(batch.length, kept.size) ? inBatch : kept;
}

// ── Step 1: site_map ────────────────────────────────────────────────────────

async function readJsonList(jobId: string, key: string): Promise<string[]> {
  const row = await masterKnex(`${S}.extraction_additional_info`).where({ job_id: jobId, key }).select("value").first();
  if (!row?.value) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) { logger.warn(`${key} is not an array — ignoring`, { jobId, got: typeof parsed }); return []; }
    return parsed.filter((d): d is string => typeof d === "string").map((d) => d.trim()).filter(Boolean);
  } catch { return []; }
}

/** Discover every same-site URL and persist the list. Network: discovery only, no page scrapes. */
export async function runSiteMap(jobId: string, job: JobRow): Promise<number> {
  const discovery = await discoverUrlsForCrawl(job.institution_url, { limit: 10000 });
  const origin = new URL(job.institution_url).origin;
  let found: { url: string; source: string }[] = filterUrls(discovery.urls, origin).map((url) => ({ url, source: discovery.method }));

  // Related domains: an admin-curated hint for a multi-campus institution whose country site is a
  // genuinely different registrable domain (monash.edu.my vs monash.edu). Opt-in config, not
  // discovery. ponytail: capped at 10 — a typo'd huge list shouldn't multiply discovery cost.
  for (const domain of (await readJsonList(jobId, "related_domains")).slice(0, 10)) {
    try {
      const seed = domain.includes("://") ? domain : `https://${domain}`;
      const related = await discoverUrlsForCrawl(seed, { limit: 10000 });
      const urls = filterUrls(related.urls, new URL(seed).origin);
      found.push(...urls.map((url) => ({ url, source: "related_domain" })));
      await _stepDeps.writeEvent(jobId, "related_domain_discovered", {
        phase: "course_discovery",
        message: `Discovered ${urls.length} URLs from related domain ${domain} via ${related.method}`,
        data: { domain, method: related.method, count: urls.length },
      });
    } catch (err) {
      logger.warn("Related-domain discovery failed", { jobId, domain, err: String(err) });
    }
  }

  const { patterns: blocklist, invalid } = compileBlocklist(await readJsonList(jobId, "url_blocklist_patterns"));
  if (invalid.length) {
    logger.warn("Ignoring invalid url_blocklist_patterns entries", { jobId, invalid });
    await _stepDeps.writeEvent(jobId, "blocklist_pattern_invalid", {
      level: "warn", phase: "site_map",
      message: `${invalid.length} blocklist pattern(s) are not valid regular expressions and were ignored`,
      data: { invalid },
    });
  }
  if (blocklist.length) {
    const before = found.length;
    found = found.filter(({ url }) => !blocklist.some((rx) => rx.test(url)));
    if (before !== found.length) logger.info("Blocklist filtered URLs", { jobId, before, after: found.length });
  }

  // Guided URLs and the homepage ride along so the snapshot step fetches them too — the page
  // worker and site_analysis then get cache hits instead of scraping.
  const guided = collectGuidedUrls(typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : job.guided_urls);
  found.push(...guided.map((url) => ({ url, source: "guided" })));
  found.push({ url: job.institution_url, source: "homepage" });

  const inserted = await upsertSiteUrls(jobId, found);
  const total = new Set(found.map((f) => normaliseUrl(f.url))).size;

  // Per-source counts, not just a total: each discovery source swallows its own failure as [], so
  // one healthy-looking number can hide the loss of the source that mattered.
  const sourceNote = discovery.sources
    ? ` (${Object.entries(discovery.sources).map(([k, v]) => `${k}: ${v}`).join(", ")})`
    : "";
  await _stepDeps.writeEvent(jobId, "urls_discovered_raw", {
    phase: "course_discovery",
    level: discovery.sources && Object.values(discovery.sources).some((n) => n === 0) ? "warn" : "info",
    message: `Discovered ${total} URLs via ${discovery.method}${sourceNote} — ${inserted} new on the site list`,
    data: { method: discovery.method, count: total, new: inserted, sources: discovery.sources ?? null },
  });
  return total;
}

/**
 * Publish the snapshot step as concurrent batches. Batches are consumed CONCURRENTLY, so each
 * carries the id of THIS dispatch; the last batch of a run to land is the one that advances the
 * chain (see site-snapshot.snapshotRunOutcome). Returns how many batches went out.
 */
/** `fresh` re-fetches every page even if a snapshot within the window exists — the admin's
 *  "re-snapshot" after a scraper fix. Default false: a rerun on an unchanged site stays free. */
export async function dispatchSnapshotBatches(jobId: string, urls: string[], pageCap: number, fresh = false): Promise<number> {
  const capped = urls.slice(0, pageCap || 500);
  const batches = Math.ceil(capped.length / SNAPSHOT_BATCH_SIZE);
  const runId = randomUUID();
  for (let i = 0; i < batches; i++) {
    await _stepDeps.publish(EXTRACTION_QUEUES.STEPS, {
      jobId, step: "site_snapshot", fresh,
      urls: capped.slice(i * SNAPSHOT_BATCH_SIZE, (i + 1) * SNAPSHOT_BATCH_SIZE),
      batch: { runId, index: i + 1, total: batches },
    });
  }
  return batches;
}

// ── Step 3: site_analysis ───────────────────────────────────────────────────

/**
 * Homepage → Gemini → institution overview + site intelligence. The homepage is read in FULL mode
 * (its footer IS the data) while the snapshot step stores MAIN mode, so this is the one page the
 * chain may fetch outside site_snapshot — once, and the store keeps it for the freshness window.
 */
export async function runSiteAnalysis(jobId: string, job: JobRow): Promise<string[]> {
  const isVisaService = job.source_type === "visa_service";
  const homepage = await getPage(job.institution_url, { withLinks: true, onlyMainContent: false });
  if (!homepage.markdown && homepage.error) throw new Error(`Failed to scrape homepage: ${homepage.error}`);

  await _stepDeps.writeEvent(jobId, "page_fetched", {
    phase: "site_mapping",
    message: `Read homepage via ${homepage.scraper}${homepage.fromCache ? " (snapshot)" : ""} (${homepage.markdown.length} chars)`,
    data: { scraper: homepage.scraper, chars: homepage.markdown.length, from_cache: homepage.fromCache },
  });

  const pageText = truncateMarkdown(homepage.markdown);
  const analysis = await extractJson<SiteAnalysisResult>({
    system: SITE_ANALYSIS_SYSTEM,
    prompt: isVisaService
      ? visaServiceSiteAnalysisPrompt(job.institution_url, pageText, job.guidance_notes)
      : siteAnalysisPrompt(job.institution_url, pageText, job.guidance_notes),
  });

  // The prompt's response key is `other_social_urls`; the DB column is `other_social_links`.
  const { other_social_urls, ...institutionRest } = analysis.institution as Record<string, unknown>;
  await writeInstitutionOverview(jobId, {
    ...institutionRest,
    ...(Array.isArray(other_social_urls) && other_social_urls.length ? { other_social_links: other_social_urls } : {}),
    source_url: job.institution_url,
  } as any);
  await writeSiteIntelligence(jobId, analysis.site_intelligence as any);

  const patterns = analysis.course_page_patterns ?? [];
  await _stepDeps.writeEvent(jobId, "site_analyzed", {
    phase: "site_mapping",
    message: "Site analysis complete",
    data: { patterns },
  });

  // The "institution" step does a better overview than the homepage alone (it also reads the
  // contact page) and "branches" chains off it. It is a side branch, not part of the chain, but
  // it obeys the same gate so a manual-mode job does not start work behind the admin's back.
  if (!job.source_type || job.source_type === "institution") {
    if (job.step_mode === "manual") {
      await _stepDeps.setProgress(jobId, { institution: "waiting" });
    } else {
      await _stepDeps.publish(EXTRACTION_QUEUES.STEPS, { jobId, step: "institution" });
    }
  }
  return patterns;
}

// ── Step 4: url_classify ────────────────────────────────────────────────────

/** ponytail: 200 rather than the old 800 — each URL now carries a page excerpt in the prompt. */
const CLASSIFIER_BATCH = 200;
const EXCERPT_CHARS = 300;
const EXCERPT_CONCURRENCY = 8;
const CLASSIFY_ALL_CAP = 3200;

/** First EXCERPT_CHARS of each snapshotted page, keyed by normalised URL. Pages not yet snapshotted are absent.
 *  One file read per URL, a few at a time — never a scrape. */
async function excerptsFor(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < urls.length; i += EXCERPT_CONCURRENCY) {
    await Promise.all(urls.slice(i, i + EXCERPT_CONCURRENCY).map(async (url) => {
      const page = await readSnapshot(url, "main");
      if (page) out.set(url, page.markdown.slice(0, EXCERPT_CHARS).replace(/\s+/g, " ").trim());
    }));
  }
  return out;
}

/** A URL line for the prompt: the URL, then what the page actually says, when we have it. */
function classifierLine(url: string, excerpt: string | undefined): string {
  return excerpt ? `${url}\n    ↳ ${excerpt}` : url;
}

async function latestPatterns(jobId: string): Promise<string[]> {
  const ev = await masterKnex(`${S}.extraction_job_events`)
    .where({ job_id: jobId, kind: "site_analyzed" }).orderBy("created_at", "desc").select("data").first();
  const data = typeof ev?.data === "string" ? JSON.parse(ev.data) : ev?.data;
  return Array.isArray(data?.patterns) ? data.patterns : [];
}

/**
 * One category per URL for what the heuristics left null: lite tier, batched, page excerpt beside
 * each URL. A URL the model puts under an unknown key or does not return at all stays null (→ other).
 */
async function categoriseWithModel(jobId: string, candidates: string[]): Promise<Map<string, SiteUrlCategory>> {
  const out = new Map<string, SiteUrlCategory>();
  const excerpts = await excerptsFor(candidates);
  const known = new Set<string>(SITE_URL_CATEGORIES);
  for (let i = 0; i < candidates.length; i += CLASSIFIER_BATCH) {
    const batch = candidates.slice(i, i + CLASSIFIER_BATCH);
    const inBatch = new Set(batch);
    const result = await extractJson<UrlCategoryResult>({
      system: SITE_ANALYSIS_SYSTEM,
      prompt: urlCategoryPrompt(batch.map((u) => classifierLine(u, excerpts.get(u))), SITE_URL_CATEGORIES),
      maxTokens: 65536,
      tier: "lite",
    });
    for (const [cat, list] of Object.entries(result.categories ?? {})) {
      if (!known.has(cat) || !Array.isArray(list)) continue;
      for (const raw of list) {
        const u = typeof raw === "string" ? normaliseUrl(raw.trim()) : "";
        if (inBatch.has(u) && !out.has(u)) out.set(u, cat as SiteUrlCategory);
      }
    }
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
  }
  return out;
}

/**
 * Categorise every site URL. Course detection is unchanged — heuristic first (free); the model
 * only NARROWS a list over 500 or CLASSIFIES when the heuristic found nothing. Then every URL
 * gets a category: guided key > course pick > path heuristic > model pass (lite) > other. Writes
 * `category` on extraction_site_urls; queue_pages reads `course` out of it.
 */
export async function runUrlClassify(jobId: string, job: JobRow): Promise<{ course: number; total: number; categories: Record<string, number> }> {
  const isVisaService = job.source_type === "visa_service";
  const rows = await listActiveSiteUrls(jobId);
  const urls = rows.map((r) => r.url);
  const guidedRaw = typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : job.guided_urls;
  const guided = collectGuidedUrls(guidedRaw).map(normaliseUrl);
  const patterns = await latestPatterns(jobId);
  const buildPrompt = isVisaService ? visaServiceUrlDiscoveryPrompt : urlDiscoveryPrompt;

  let picked = new Set(urls.filter(isVisaService ? looksLikeVisaServiceUrl : looksLikeCourseUrl));
  let usedLlm = false;

  const classify = async (candidates: string[], narrowing: boolean) => {
    usedLlm = true;
    const excerpts = await excerptsFor(candidates);
    const kept = new Set<string>();
    let distrusted = 0;
    const batches = Math.ceil(candidates.length / CLASSIFIER_BATCH);
    for (let i = 0; i < candidates.length; i += CLASSIFIER_BATCH) {
      const batch = candidates.slice(i, i + CLASSIFIER_BATCH);
      const result = await extractJson<UrlDiscoveryResult>({
        system: SITE_ANALYSIS_SYSTEM,
        prompt: buildPrompt(batch.map((u) => classifierLine(u, excerpts.get(u))), patterns),
        maxTokens: 65536,
        tier: "lite",
      });
      const modelPicked = result.course_urls?.length ? result.course_urls.map(normaliseUrl) : [];
      if (narrowing) {
        const merged = mergeClassifierBatch(batch, modelPicked);
        if (merged.size === batch.length && modelPicked.length < batch.length) distrusted++;
        for (const u of merged) kept.add(u);
      } else {
        for (const u of modelPicked) if (batch.includes(u)) kept.add(u);
      }
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
    }
    if (distrusted > 0) {
      await _stepDeps.writeEvent(jobId, "url_classifier_distrusted", {
        level: "warn", phase: "course_discovery",
        message: `${distrusted} of ${batches} URL-classifier batches returned under the ${Math.round(MIN_CLASSIFIER_KEEP_RATIO * 100)}% floor — kept the heuristic's URLs for those batches`,
        data: { batches_distrusted: distrusted, batches_total: batches, floor: MIN_CLASSIFIER_KEEP_RATIO },
      });
    }
    return kept;
  };

  if (picked.size > 500) picked = await classify([...picked], true);
  if (picked.size === 0 && urls.length > 0) picked = await classify(urls.slice(0, CLASSIFY_ALL_CAP), false);
  if (picked.size === 0) picked.add(normaliseUrl(job.institution_url)); // fallback: the homepage itself

  // `usedLlm` here means the COURSE pick was model-assisted; that is the source for course rows only.
  const merged = categoriesFor(urls, picked, guidedUrlCategories(guidedRaw, normaliseUrl), usedLlm ? "llm" : "heuristic");
  // Only what the free passes could not place goes to the model. ponytail: same CLASSIFY_ALL_CAP as
  // the course pass — past it the tail is "other", not another round of lite calls.
  const unplaced = [...merged].filter(([, v]) => v === null).map(([u]) => u);
  const attempted = new Set(unplaced.slice(0, CLASSIFY_ALL_CAP));
  const modelled = attempted.size ? await categoriseWithModel(jobId, [...attempted]) : new Map<string, SiteUrlCategory>();
  if (modelled.size) usedLlm = true;

  // Per-URL provenance: a URL the model was shown but did not return is still the model's "other".
  const verdicts = new Map<string, CategoryVerdict>();
  for (const [url, v] of merged) {
    const m = modelled.get(url);
    verdicts.set(url, v ?? (m ? { category: m, source: "llm" } : { category: "other", source: attempted.has(url) ? "llm" : "heuristic" }));
  }
  await setSiteUrlCategories(jobId, verdicts);

  const byCategory: Record<string, number> = {};
  for (const { category } of verdicts.values()) byCategory[category] = (byCategory[category] ?? 0) + 1;
  const course = byCategory.course ?? 0;
  const summary = Object.entries(byCategory).filter(([k]) => k !== "course").map(([k, n]) => `${k} ${n}`).join(", ");
  await _stepDeps.writeEvent(jobId, "urls_filtered", {
    phase: "course_discovery",
    message: `${course} course pages identified out of ${urls.length}${usedLlm ? " (model-assisted)" : ""}${summary ? `; also ${summary}` : ""}`,
    data: { count: course, total: urls.length, used_llm: usedLlm, categories: byCategory, model_categorised: modelled.size, sample: [...picked].slice(0, 10) },
  });
  return { course, total: urls.length, categories: byCategory };
}

// ── Step 5: queue_pages ─────────────────────────────────────────────────────

/** Queue every `course`-category URL for the page worker. The page worker reads the snapshot; it does not scrape. */
export async function runQueuePages(jobId: string, job: JobRow): Promise<{ queued: number; idle: boolean }> {
  const courseUrls = await listSiteUrlsByCategory(jobId, "course");
  if (courseUrls.length === 0) courseUrls.push(job.institution_url);

  let queued = 0;
  let duplicates = 0;
  let cappedOut = 0;
  for (const url of courseUrls) {
    // A duplicate is a page ALREADY COVERED, a cap refusal is a page THROWN AWAY. Count them apart.
    const { id, reason } = await insertQueueItemDetailed(jobId, url);
    if (!id) { if (reason === "page_cap") cappedOut++; else duplicates++; continue; }
    await _stepDeps.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId: id, url });
    queued++;
  }

  if (duplicates > 0 || cappedOut > 0) {
    const parts = [`${queued} newly queued`];
    if (duplicates > 0) parts.push(`${duplicates} already covered`);
    if (cappedOut > 0) parts.push(`${cappedOut} DISCARDED at the page cap`);
    await _stepDeps.writeEvent(jobId, "urls_not_queued", {
      level: cappedOut > 0 ? "warn" : "info",
      phase: "course_discovery",
      message: `${courseUrls.length} course URLs: ${parts.join(", ")}.`
        + (cappedOut > 0 ? " Raise page_cap or use Deep Scrape to cover the rest." : ""),
      data: { queued, duplicates, discarded_at_cap: cappedOut, course_urls: courseUrls.length, at_page_cap: cappedOut > 0, page_cap: Number(job.page_cap) || 500 },
    });
  }

  // Nothing published means nothing advances the job — a re-dispatch whose URLs are all already
  // queued would otherwise sit in "processing" forever. Counts `processing` too: pages still in
  // flight will retire the job through the normal completion path.
  const live = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId }).whereIn("status", ["pending", "processing"]).count({ n: "*" }).first();
  const idle = queued === 0 && Number(live?.n ?? 0) === 0;

  // The denominator of the admin's progress bar is what was actually QUEUED, not what was found:
  // URLs refused at page_cap were thrown away and can never be scraped, so counting them holds a
  // finished job below 100%. The queue is the truth (it also carries pages other producers added,
  // e.g. pagination overflow), and reading it keeps a re-run of this step idempotent.
  const [{ n: queuedTotal }] = await masterKnex(`${S}.extraction_queue`).where({ job_id: jobId }).count({ n: "*" });

  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    total_pages_found: Number(queuedTotal),
    pages_total: Number(queuedTotal),
    ...(idle ? { status: "review" } : {}),
    processing_heartbeat_at: masterKnex.fn.now(),
    updated_at: masterKnex.fn.now(),
  });
  // Legacy keys the job row and tab badges still read, alongside the per-step keys.
  await _stepDeps.setProgress(jobId, {
    site_mapping: "done", course_discovery: "done",
    data_extraction: idle ? "done" : "processing", verification: "waiting",
  });

  if (idle) {
    await _stepDeps.writeEvent(jobId, "discovery_found_nothing_new", {
      level: "warn", phase: "course_discovery",
      message: `Discovery found no pages that weren't already queued (${courseUrls.length} URLs, all known)`,
      data: { urls: courseUrls.length },
    });
  }
  return { queued, idle };
}

export async function republishRetryableQueueItems(jobId: string): Promise<{ candidates: number; dispatched: number }> {
  const items = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId })
    .whereIn("status", ["pending", "failed", "paused"])
    .select("id", "url");

  let dispatched = 0;
  for (const item of items) {
    const flipped = await masterKnex(`${S}.extraction_queue`)
      .where({ id: item.id })
      .whereIn("status", ["pending", "failed", "paused"])
      .update({
        status: "pending",
        updated_at: masterKnex.fn.now(),
        processing_meta: masterKnex.raw(
          `coalesce(processing_meta, '{}'::jsonb) || '{"attempt_token": null, "awaiting_publish": true}'::jsonb`,
        ),
      });
    if (flipped === 0) continue;
    await _stepDeps.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId: item.id, url: item.url });
    await masterKnex(`${S}.extraction_queue`)
      .where({ id: item.id, status: "pending" })
      .whereRaw(`processing_meta->>'attempt_token' is null`)
      .update({ processing_meta: masterKnex.raw(`processing_meta - 'awaiting_publish'`) });
    dispatched++;
  }
  return { candidates: items.length, dispatched };
}
