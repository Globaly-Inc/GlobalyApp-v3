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
import { politeDelay } from "./scraper.js";
import { siteOf } from "./html-utils.js";
import { writeJobEvent } from "./staging-writer.js";

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
export interface SnapshotBatch { runId: string; index: number; total: number }

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

/** Why a fetched page is INACTIVE, or null when it is readable. Pure; the snapshot step stamps it on the site list. */
export function deadReasonOf(page: { notFound?: boolean; blocked?: boolean; markdown: string }): DeadReason | null {
  if (page.notFound) return "not_found";
  if (page.blocked) return "blocked";
  if (page.markdown.length < 50) return "empty";
  return null;
}
/** Pages in flight per batch. ponytail: 4 is polite for one edu host and cuts a 500-page site
 *  from ~an hour to ~15 minutes; set SNAPSHOT_CONCURRENCY=2 if a site starts answering 429. */
const SNAPSHOT_CONCURRENCY = Math.max(1, Number(process.env.SNAPSHOT_CONCURRENCY) || 4);

async function jobHalted(jobId: string): Promise<boolean> {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
    .select("status", "stop_requested").first();
  return !job || !!job.stop_requested || ["paused", "failed", "declined"].includes(job.status);
}

export async function snapshotSite(jobId: string, urls: string[], batch?: SnapshotBatch, fresh = false): Promise<number> {
  const label = batch ? ` (batch ${batch.index}/${batch.total})` : "";
  let uploaded = 0;
  let processed = 0;
  let halted = false;
  const failed: string[] = [];
  /** Pages that came back unreadable — stamped `dead_reason` on the site list, counted as Inactive on the Site Context tab. */
  const dead: { url: string; reason: DeadReason }[] = [];
  const alive: string[] = [];
  /** PDFs the pages link to — offered on the Site Context tab as excluded rows the admin can pick up. */
  const linkedPdfs = new Set<string>();
  /** One page through the store (a scrape + file write on a miss). Returns whether the scraper was hit. */
  async function snapshotOne(url: string): Promise<boolean> {
    try {
      // ponytail: no retry here — Scrapling already walks get → stealthy_fetch → browser fetch
      // internally, and a Firecrawl escalation would bill credits the account may not have.
      // A PDF on the list (admin-added fee schedule, prospectus) is read by Vision, not Scrapling.
      const page = isPdfUrl(url)
        ? await getDocument(url, { fresh })
        : await getPage(url, { onlyMainContent: true, withLinks: true, fresh });
      const reason = deadReasonOf(page);
      if (reason) { failed.push(url); dead.push({ url, reason }); return !page.fromCache; }
      uploaded++;
      alive.push(url);
      for (const f of fileLinksOf(page.links)) if (isPdfUrl(f)) linkedPdfs.add(f);
      return !page.fromCache;
    } catch (err) {
      failed.push(url);
      logger.warn("Snapshot failed", { jobId, url, err: String(err) });
      return true;
    }
  }
  // Halt gate and heartbeat every ~25 pages, checked at a chunk boundary so a stop request is
  // seen within one chunk's worth of work.
  const gateEvery = Math.ceil(25 / SNAPSHOT_CONCURRENCY) * SNAPSHOT_CONCURRENCY;
  for (let i = 0; i < urls.length; i += SNAPSHOT_CONCURRENCY) {
    if (processed % gateEvery === 0) {
      if (await jobHalted(jobId)) { halted = true; break; }
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
    }
    const chunk = urls.slice(i, i + SNAPSHOT_CONCURRENCY);
    processed += chunk.length;
    const fetched = await Promise.all(chunk.map(snapshotOne));
    if (fetched.some(Boolean)) await politeDelay(300, 900);
  }
  // Discovery drops asset URLs, so this is the one place linked PDFs surface. Excluded by default:
  // nothing fetches them until the admin restores one and gives it a category.
  if (dead.length || alive.length) await setSiteUrlLiveness(jobId, dead, alive);
  let suggestedPdfs = 0;
  if (linkedPdfs.size) {
    suggestedPdfs = await upsertSiteUrls(jobId, [...linkedPdfs].map((url) => ({ url, source: "linked_pdf", excluded: true })));
  }
  await writeJobEvent(jobId, "site_snapshot_uploaded", {
    phase: "site_mapping",
    level: halted || failed.length ? "warn" : "info",
    message: halted
      ? `Site snapshot stopped${label}: job paused or stop requested after ${processed} of ${urls.length} pages`
      : `${uploaded} of ${urls.length} pages written to ${SNAPSHOT_PREFIX}/${urls[0] ? siteOf(urls[0]) : ""}${label}`,
    data: { uploaded, processed, failed: failed.length, dead: dead.length, failed_sample: failed.slice(0, 10), suggested_pdfs: suggestedPdfs, halted, fresh, ...(batch ?? {}) },
  });
  return uploaded;
}
