// Site snapshot: right after site mapping, every discovered same-site URL is fetched (through
// the extraction_pages cache, so the page worker later gets cache hits instead of re-scraping)
// and its markdown is uploaded to GCS as one .md file PER PAGE, grouped per site:
//
//   extraction/www/<site domain>/<hostname>/<path slug>-<url digest>.md
//   extraction/www/mit.edu/www.mit.edu/index-3f2a91c4.md
//   extraction/www/mit.edu/catalog.mit.edu/about_overview-7b10de55.md
//
// Deterministic paths, so a rerun overwrites rather than accumulates. The slug is readable but
// lossy, so the digest is what keeps two different pages out of one object (see snapshotPathFor).
// Images and documents the page links to are listed at the end of its file under "Linked files"
// — discovery drops asset URLs from the crawl list, so this is where they are recorded.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { getPage, getDocument, isPdfUrl, fileLinksOf, SNAPSHOT_PREFIX } from "./page-store.js";
import { upsertSiteUrls, setSiteUrlLiveness, type DeadReason } from "../repositories/site-urls.repository.js";
import { throttleForHost } from "./scraper.js";
import { hostOf } from "./host-health.js";
import { siteOf } from "./html-utils.js";
import { writeJobEvent } from "./staging-writer.js";
import { isScraperInfraFailure } from "./classify-failure.js";

// The file layout and its helpers live with the store that writes and reads them.
export { fileLinksOf, snapshotPathFor, SNAPSHOT_PREFIX } from "./page-store.js";

const logger = createChildLogger("site-snapshot");

/**
 * Batches are consumed CONCURRENTLY, so no single batch knows whether the step as a whole is
 * finished: left alone, the first batch to land reports "done" for all of them, and whichever
 * batch finishes last decides the final status — a later success erasing an earlier failure.
 *
 * A batch names its own run. `runId` is minted once per dispatch and carried in every batch
 * message, so it lands in each batch's job event (both the success event and the step worker's
 * step_error write spread `...batch` into `data`).
 *
 * This replaced a stored run marker, twice over, and the lesson is worth keeping: the marker first
 * lived in `pipeline_progress` (a blob the job worker rewrites as a whole literal, which erased it
 * every run), then in `extraction_additional_info` — where two overlapping dispatches for one job
 * could both delete the row before either inserted, since that table has no unique on
 * (job_id, key) and a transaction gives atomicity, not mutual exclusion. Two markers, one read
 * arbitrarily, and both runs numbering batches 1..N meant one run's events satisfied the other's
 * count. Overlapping dispatches are reachable: the job worker deliberately tolerates a message for
 * a job already "processing", for redelivery.
 *
 * Carrying identity in the message removes the whole class — no shared row to race over, no
 * timestamp window, and two runs' batch 3 no longer collapse onto one key. A constraint on the
 * marker would have fixed the duplicate rows and NOT that collision.
 */
export interface SnapshotBatch {
  runId: string;
  index: number;
  total: number;
  /** This run is the time-budgeted HEAD of the site: when it completes, the worker advances the
   *  chain as usual and then dispatches the FULL list as a second run (which re-reads the head
   *  from cache and fetches only the tail). Carried on the message like runId, for the same
   *  reason — a stored marker is what the run-identity lesson above exists to prevent. */
  thenFull?: boolean;
}

/**
 * The URLs wave 1 fetches: walk the RANKED list spending each page's host gap from a per-host
 * time budget, and stop admitting a host's URLs once its budget is spent. Pure.
 *
 * Per host, not global, because hosts don't queue on each other — a 30-minute budget admits
 * budget ÷ gap pages of EACH host, so a healthy site (200ms = 9,000 pages) usually fits whole
 * and never splits, while a host that taught us an 8s gap gets 225 pages of head and the rest
 * behind the advancing pipeline. The list arrives ranked (course URLs first), so the head is
 * the useful part by construction.
 */
export function snapshotHead(urls: string[], gapOf: (host: string) => number, budgetMs: number): string[] {
  if (budgetMs <= 0) return urls;
  const left = new Map<string, number>();
  const head: string[] = [];
  for (const url of urls) {
    const host = hostOf(url) ?? "";
    const ms = left.get(host) ?? budgetMs;
    const gap = Math.max(1, gapOf(host));
    if (ms >= gap) { head.push(url); left.set(host, ms - gap); }
  }
  return head;
}

export interface SnapshotEventRow { id: string; kind: string; phase: string | null; data: unknown }

/**
 * Distinct batches heard from, and how many of those errored. Pure, so the dedupe the whole fix
 * rests on is checkable without a database.
 *
 * Keyed on the batch index, so a batch redelivered after its worker died between writing the
 * event and acking counts once. An event carrying no index (an unbatched admin re-run) falls back
 * to its own row id rather than collapsing every such event onto one key. A batch that errored and
 * then succeeded on redelivery is one entry in `reported` and still counted in `errored`, so the
 * run reports failed with both events on the timeline — conservative on purpose.
 *
 * A batch that HALTED (saw the job paused/stopped mid-way) writes its event with `halted: true` so
 * the timeline shows where it stopped; it is counted as errored here, because its pages were not
 * fetched and a run containing it must not hand off to site_analysis as if the snapshot were whole.
 */
export function tallySnapshotEvents(events: SnapshotEventRow[], runId: string | undefined): { reported: number; errored: number } {
  const reported = new Set<string>();
  const errored = new Set<string>();
  for (const e of events) {
    if (e.kind === "step_error" && e.phase !== "site_snapshot") continue;
    const data = (typeof e.data === "string" ? JSON.parse(e.data) : e.data ?? {}) as { runId?: string; index?: number; halted?: boolean };
    // Only this run's batches. Messages and events written before runId existed both carry
    // undefined, so they still match each other and behave exactly as they did — the deploy
    // window where an old message meets new code needs no special case.
    if (data?.runId !== runId) continue;
    const key = data?.index != null ? `i${data.index}` : `e${e.id}`;
    reported.add(key);
    if (e.kind === "step_error" || data?.halted === true) errored.add(key);
  }
  return { reported: reported.size, errored: errored.size };
}

export function snapshotVerdict(reported: number, errored: number, expected: number): "done" | "failed" | "pending" {
  if (reported < expected) return "pending";
  return errored > 0 ? "failed" : "done";
}

/**
 * Has every batch of the CURRENT run reported in, and did any of them fail?
 *
 * Counted from the durable events each batch already writes — one `site_snapshot_uploaded` on
 * success, one `step_error` when the batch threw — rather than an incrementing counter, which
 * concurrent batches would lose to a read-modify-write race. A batch whose worker died writes
 * neither, so the step stays "processing" rather than falsely reporting done; that is the
 * stuck-worker case the reclaim sweep exists for, not something to paper over here.
 */
export async function snapshotRunOutcome(
  jobId: string,
  batch: SnapshotBatch,
): Promise<"done" | "failed" | "pending"> {
  const events = await masterKnex(`${S}.extraction_job_events`)
    .where({ job_id: jobId })
    .whereIn("kind", ["site_snapshot_uploaded", "step_error"])
    .select("id", "kind", "phase", "data");

  const { reported, errored } = tallySnapshotEvents(events, batch.runId);
  return snapshotVerdict(reported, errored, batch.total);
}

/** Pages per step message. A crash mid-step loses one batch, not the whole site, and the
 *  concurrent STEPS consumer works batches in parallel. */
export const SNAPSHOT_BATCH_SIZE = 100;

/** Why a fetched page is INACTIVE, or null when it is readable. Pure; the snapshot step stamps it on the site list.
 *  "scraper_down" is OUR stack failing (a Chromium-leaked Scrapling, no Firecrawl credits) — it says
 *  nothing about the page, so it is never stamped: 222 live Purdue programme pages were once marked dead that way. */
export function deadReasonOf(page: { notFound?: boolean; blocked?: boolean; markdown: string; error?: string }): DeadReason | "scraper_down" | null {
  if (page.notFound) return "not_found";
  if ((page.blocked || page.markdown.length < 50) && isScraperInfraFailure(page.error)) return "scraper_down";
  if (page.blocked) return "blocked";
  if (page.markdown.length < 50) return "empty";
  return null;
}
/** Pages in flight per batch.
 *
 *  NOT a politeness knob — `throttleForHost` reserves a global per-host slot for every scrape, so
 *  the request RATE is the host-health gap whatever this is set to; extra fetchers only queue. It
 *  decides how much of that gap we manage to use: a fetcher's cycle is gap-wait + scrape (~3s), so
 *  the pool must hold roughly cycle ÷ gap pages to keep the slot busy — about 30 at the 100ms
 *  floor, which 8 here reaches once the usual 4 batches are running concurrently (a LONE batch,
 *  e.g. the admin re-running one, stays below the gap and that is fine). Raise it if
 *  HOST_THROTTLE_MIN_MS goes lower, or the lower gap buys nothing; note it also multiplies
 *  concurrent Scrapling MCP calls, and only the browser tiers are separately capped.
 *  A real 429 is answered by the gap doubling, not by shrinking this. */
const SNAPSHOT_CONCURRENCY = Math.max(1, Number(process.env.SNAPSHOT_CONCURRENCY) || 8);

/** Halt-gate and heartbeat cadence, in pages. */
const HALT_CHECK_EVERY = 25;

/**
 * Run `task` over 0..count-1 with at most `concurrency` in flight, stopping once a task returns
 * false. A CONTINUOUS pool, not fixed chunks: a chunk made every page wait for the slowest of its
 * group, so one 35s browser tier idled three healthy fetchers and left the host slot unclaimed
 * for the whole stall. Exported because jev-url-classify had the same sequential-loop problem and
 * one copy is better than two, and because the invariants (every index once, never more than N in
 * flight, an early stop starts nothing more) are what a hand-rolled pool gets wrong — pinned in
 * test:site-snapshot-path.
 */
export async function runPool(count: number, concurrency: number, task: (i: number) => Promise<boolean>): Promise<void> {
  let next = 0;
  let stop = false;
  let failure: unknown;
  let failed = false;
  const worker = async () => {
    while (!stop) {
      const i = next++;
      if (i >= count) return;
      try {
        if (!(await task(i))) stop = true;
      } catch (err) {
        // A throw stops the pool exactly like a false return, and is re-thrown only once every
        // worker has settled. Letting it reject straight out of Promise.all left the other
        // workers looping detached: the step reported failed while its pages went on being
        // scraped and the classifier went on buying Jev calls, for results nobody would read.
        stop = true;
        if (!failed) { failed = true; failure = err; }
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, count)) }, worker));
  if (failed) throw failure;
}

export async function jobHalted(jobId: string): Promise<boolean> {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
    .select("status", "stop_requested").first();
  return !job || !!job.stop_requested || ["paused", "failed", "declined"].includes(job.status);
}

export async function snapshotSite(jobId: string, urls: string[], batch?: SnapshotBatch, fresh = false): Promise<number> {
  const label = batch ? ` (batch ${batch.index}/${batch.total})` : "";
  /** Liveness observation time for this batch — see setSiteUrlLiveness. */
  const observedAt = new Date();
  let uploaded = 0;
  let processed = 0;
  let halted = false;
  const failed: string[] = [];
  /** Pages that came back unreadable — stamped `dead_reason` on the site list, counted as Inactive on the Site Context tab. */
  const dead: { url: string; reason: DeadReason }[] = [];
  const alive: string[] = [];
  const scraperDown: string[] = [];
  /** PDFs the pages link to — offered on the Site Context tab as excluded rows the admin can pick up. */
  const linkedPdfs = new Set<string>();
  /** One page through the store (a scrape + file write on a miss). */
  async function snapshotOne(url: string): Promise<void> {
    try {
      // ponytail: no retry here — Scrapling already walks get → stealthy_fetch → browser fetch
      // internally, and a Firecrawl escalation would bill credits the account may not have.
      // A PDF on the list (admin-added fee schedule, prospectus) is read by Vision, not Scrapling.
      // The PDF branch is the one fetch here that paces itself nowhere else: getDocument →
      // safeFetch never books a host slot, so an admin who restores a dozen linked PDFs onto the
      // site list used to be paced only by the chunk sleep this function no longer has.
      if (isPdfUrl(url)) await throttleForHost(url);
      const page = isPdfUrl(url)
        ? await getDocument(url, { fresh })
        : await getPage(url, { onlyMainContent: true, withLinks: true, fresh, breaker: true });
      const reason = deadReasonOf(page);
      if (reason === "scraper_down") { failed.push(url); scraperDown.push(url); return; }
      if (reason) { failed.push(url); dead.push({ url, reason }); return; }
      uploaded++;
      alive.push(url);
      for (const f of fileLinksOf(page.links)) if (isPdfUrl(f)) linkedPdfs.add(f);
    } catch (err) {
      failed.push(url);
      logger.warn("Snapshot failed", { jobId, url, err: String(err) });
    }
  }
  // Halt gate and heartbeat every HALT_CHECK_EVERY pages. Exactly one fetcher sees each multiple
  // (the increment and the test are one synchronous step), so the gate is not re-run per worker.
  //
  // There is no sleep between pages: throttleForHost already reserves a global slot per host
  // before every scrape, and a second fixed delay here paced nothing extra — it just left the
  // slot unclaimed. Measured on bu.edu (2026-10-09): 64 pages/min against the 75/min the gap
  // then allowed.
  if (await jobHalted(jobId)) halted = true;
  else await runPool(urls.length, SNAPSHOT_CONCURRENCY, async (i) => {
    await snapshotOne(urls[i]);
    processed++;
    if (processed % HALT_CHECK_EVERY !== 0) return true;
    if (await jobHalted(jobId)) { halted = true; return false; }
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
    return true;
  });
  // Discovery drops asset URLs, so this is the one place linked PDFs surface. Excluded by default:
  // nothing fetches them until the admin restores one and gives it a category.
  if (dead.length || alive.length) await setSiteUrlLiveness(jobId, dead, alive, observedAt);
  let suggestedPdfs = 0;
  if (linkedPdfs.size) {
    suggestedPdfs = await upsertSiteUrls(jobId, [...linkedPdfs].map((url) => ({ url, source: "linked_pdf", excluded: true })));
  }
  await writeJobEvent(jobId, "site_snapshot_uploaded", {
    phase: "site_mapping",
    level: halted || failed.length ? "warn" : "info",
    message: halted
      ? `Site snapshot stopped${label}: job paused or stop requested after ${processed} of ${urls.length} pages`
      : `${uploaded} of ${urls.length} pages written to ${SNAPSHOT_PREFIX}/${urls[0] ? siteOf(urls[0]) : ""}${label}`
        + (scraperDown.length ? ` — the scraper itself failed on ${scraperDown.length} (check the Scrapling container, then re-run the snapshot)` : ""),
    data: { uploaded, processed, failed: failed.length, dead: dead.length, scraper_down: scraperDown.length, failed_sample: failed.slice(0, 10), suggested_pdfs: suggestedPdfs, halted, fresh, ...(batch ?? {}) },
  });
  return uploaded;
}
