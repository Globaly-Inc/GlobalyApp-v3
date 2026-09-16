// Worker — reclaims extraction_queue items stuck at "processing" past a stale threshold, and
// re-checks jobs whose heartbeat has gone stale for a completion that never got dispatched.
//
// Root cause this recovers from: a page's worker process can die (crash, OOM, deploy restart,
// manual kill) or its scrape/model call can hang with no timeout, while its queue row is still
// "processing". Nothing else ever revisits that row — checkAllPagesDone only runs reactively
// when ANOTHER page finishes — so if the stuck item is the last one left, the job is stuck at
// "processing" forever with nothing to unstick it.
//
// Two things make STALE_MINUTES a trustworthy signal rather than a guess:
// - scraper.ts's Crawl4AI/Firecrawl calls and llm-client.ts's retry backoff are now all bounded
//   (see EXTERNAL_FETCH_TIMEOUT_MS and INLINE_RETRY_CEILING_MS there), and a provider-mandated
//   wait longer than that bound is handled by RELEASING the claim (status -> "pending",
//   processing_meta.awaiting_publish) rather than blocking this item's "processing" claim on it —
//   so a page genuinely still being worked essentially never goes STALE_MINUTES without a write.
// - extraction-page.worker.ts tags every claim with a fresh processing_meta.attempt_token and
//   conditions every write for that attempt on it still matching. The instant this sweep reclaims
//   a "processing" row (below), it nulls that token — so if the original worker was merely slow
//   rather than dead and eventually resumes, its writes are silently rejected instead of
//   overwriting a newer (possibly already-terminal) attempt's state. extraction-page.worker.ts also
//   re-checks ownership right after its one AI call, before writing any of that call's results —
//   so a reclaimed-but-still-alive worker can still redundantly re-scrape and re-bill one model
//   call (nothing short of a hard lock for the whole attempt's duration prevents starting that),
//   but can no longer write duplicate course/campus/intake/visa-service rows once superseded.
//
// Long-running: polls every 5 minutes. Run with: npm run job:extraction-queue-reclaim
// One-shot (cron, or a manual fix for jobs already stuck): pass --once

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { checkAllPagesDone } from "../lib/queue-completion.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-queue-reclaim-worker");

const STALE_MINUTES = 20;
const MAX_RECLAIM_RETRIES = 3;
// A deferred retry (processing_meta.awaiting_publish) has its OWN scheduled due time —
// updated_at + retry_after_ms — set by extraction-page.worker.ts's in-process timer. This is how
// long past that due time the sweep waits before treating the deferral as abandoned, giving the
// timer a fair chance to fire (and publish) on its own first.
const RECLAIM_GRACE_MINUTES = 5;

type ProcessingMeta = Record<string, unknown> & {
  retry_strategy?: string; stale_reclaims?: number; awaiting_publish?: boolean; attempt_token?: string | null;
  retry_after_ms?: number;
};

// A "processing" row is stale after a flat STALE_MINUTES with no write. A "pending" +
// awaiting_publish row is different: it has a known due time (now = when it was deferred,
// retry_after_ms = how long the deferral is), which can be far longer OR shorter than
// STALE_MINUTES — reusing the flat threshold for it is exactly the bug this fixes (a 25-minute
// provider-mandated wait was being re-published after 20, before the throttle window closed).
// Applied identically in the SELECT below and in each per-row UPDATE's own re-check, so the two
// never disagree about what "due" means for a given row.
function applyDueCondition(qb: import("knex").Knex.QueryBuilder, status: string) {
  if (status === "processing") {
    qb.where("updated_at", "<", masterKnex.raw(`now() - interval '${STALE_MINUTES} minutes'`));
  } else {
    qb.whereRaw(
      `updated_at < now() - (coalesce((processing_meta->>'retry_after_ms')::bigint, 0) * interval '1 millisecond') - interval '${RECLAIM_GRACE_MINUTES} minutes'`,
    );
  }
}

async function reclaimStaleQueueItems() {
  // "pending" is in scope too, but ONLY rows tagged processing_meta.awaiting_publish — i.e. rows
  // that were flipped to pending with no message actually delivered yet: either this worker's own
  // reclaim publish failed below, or extraction-page.worker.ts released a claim to defer a retry
  // past a long provider-mandated wait (see llm-client.ts's INLINE_RETRY_CEILING_MS) and its own
  // in-process timer hasn't fired (or died before it could). Both leave "pending" with no message
  // in flight, and nothing else ever revisits a plain "pending" row — re-including it here (scoped
  // to the tag) is what makes that self-heal once it's actually due. Without the scope, an
  // ordinary backlog-pending row (nobody's died, a worker just hasn't claimed it yet) or a page-
  // worker-native anti_bot retry-pending row (which already has a real message in flight) would
  // look identical to a stranded row after sitting unclaimed long enough, and get "reclaimed" for
  // something that was never broken — eventually failing perfectly good queued work.
  const stale = await masterKnex(`${S}.extraction_queue`)
    .where((qb) => {
      qb.where({ status: "processing" }).andWhere((sub) => applyDueCondition(sub, "processing"))
        .orWhere((qb2) => qb2.where({ status: "pending" }).whereRaw(`processing_meta->>'awaiting_publish' = 'true'`)
          .andWhere((sub) => applyDueCondition(sub, "pending")));
    })
    .select("id", "job_id", "url", "status", "processing_meta");

  const failedOutright = new Set<string>();

  for (const item of stale) {
    const meta: ProcessingMeta = item.processing_meta ?? {};
    // Independent of retry_count — that column already tracks anti-bot/model retries budgeted by
    // extraction-page.worker.ts's own logic (2 attempts before it gives up). Sharing it here would
    // let a stale reclaim consume an item's ordinary retry budget (failing it after only 1 real
    // attempt) and let an ordinary retry consume the reclaim budget (skipping a legitimate retry).
    const staleReclaims = meta.stale_reclaims ?? 0;

    if (staleReclaims >= MAX_RECLAIM_RETRIES) {
      const failed = await masterKnex(`${S}.extraction_queue`)
        .where({ id: item.id, status: item.status })
        .andWhere((sub) => applyDueCondition(sub, item.status))
        .update({
          status: "failed",
          failure_class: "worker_stale",
          error: `Gave up after ${MAX_RECLAIM_RETRIES} stale reclaims — page never completed`,
          processing_meta: JSON.stringify({ ...meta, attempt_token: null }),
          updated_at: masterKnex.fn.now(),
        });
      if (failed === 0) continue; // resolved itself between the select above and here
      logger.warn("Stale queue item exhausted reclaim retries, marked failed", { queueItemId: item.id, jobId: item.job_id, url: item.url });
      failedOutright.add(item.job_id);
      continue;
    }

    // Reconstruct the retry strategy that was in flight when the worker died. The queue MESSAGE
    // carries forceFirecrawl/mobile/proxy/expandCollapsed, but the DB row doesn't — a naive
    // republish with just {jobId, queueItemId, url} silently drops a mid-escalation retry back to
    // the default scraper config, which can repeat the exact failure that required escalation in
    // the first place. processing_meta.retry_strategy already records which tier was last
    // dispatched (set by extraction-page.worker.ts's own retry logic), so it's reused here rather
    // than re-derived.
    const strategy = meta.retry_strategy;
    const publishOpts =
      strategy === "mobile" ? { forceFirecrawl: true, mobile: true, proxy: "stealth" as const, expandCollapsed: true } :
      strategy === "browser_render" ? { forceFirecrawl: true, mobile: false, proxy: "auto" as const, expandCollapsed: true } :
      {};

    // Atomic + conditional on both id AND still being stale at write time (not just at select
    // time) — closes the gap where a live worker finishes the item between the SELECT above and
    // this UPDATE. update() returning 0 means it no longer matches (already resolved, or another
    // reclaim replica already claimed it), so this replica backs off instead of clobbering it.
    // attempt_token is nulled here, not just at the next claim: this is what fences out the
    // original worker's writes starting NOW, in case it was merely slow rather than dead and later
    // resumes — see the file-header comment.
    const errorNote = item.status === "processing"
      ? `Reclaimed after ${STALE_MINUTES}min stuck in "processing" (worker likely crashed, hung, or a prior reclaim's publish failed)`
      : `Reclaimed after sitting past its own deferred-retry due time (worker likely crashed, hung, or a prior reclaim's publish failed)`;
    const claimed = await masterKnex(`${S}.extraction_queue`)
      .where({ id: item.id, status: item.status })
      .andWhere((sub) => applyDueCondition(sub, item.status))
      .update({
        status: "pending",
        failure_class: "worker_stale",
        error: errorNote,
        processing_meta: JSON.stringify({ ...meta, stale_reclaims: staleReclaims + 1, awaiting_publish: true, attempt_token: null }),
        updated_at: masterKnex.fn.now(),
      });
    if (claimed === 0) continue;

    try {
      await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId: item.job_id, queueItemId: item.id, url: item.url, ...publishOpts });
      logger.info("Reclaimed stale queue item for retry", { queueItemId: item.id, jobId: item.job_id, url: item.url, attempt: staleReclaims + 1, strategy });
    } catch (err) {
      // Row stays "pending" — since pending rows are in scope above, the next sweep re-selects it
      // (still stale) and retries the publish itself, rather than waiting on a queue drain that
      // was never going to happen.
      logger.warn("Reclaim publish failed, item stays pending for the next sweep", {
        queueItemId: item.id, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // A reclaimed-to-"pending" item resolves itself once a healthy worker processes it — that
  // worker's own success/failure path already calls checkAllPagesDone. Only a job that just had
  // an item marked "failed" directly above needs it called here; nothing else will call it.
  for (const jobId of failedOutright) {
    await checkAllPagesDone(jobId).catch((err) =>
      logger.error("checkAllPagesDone failed while unsticking a job", { jobId, error: err instanceof Error ? err.message : String(err) }));
  }

  // Defense in depth: a job can also be stuck at "processing" with its queue ALREADY fully
  // resolved if checkAllPagesDone's own transition never ran (e.g. the last item's worker died
  // right after updating queue status but before calling it). checkAllPagesDone does its own
  // "anything still pending/processing?" check first, so calling it for every job whose
  // heartbeat has gone stale is safe and cheap — it only acts when there's genuinely nothing left.
  const staleHeartbeatJobs = await masterKnex(`${S}.extraction_jobs`)
    .where({ status: "processing" })
    .where("processing_heartbeat_at", "<", masterKnex.raw(`now() - interval '${STALE_MINUTES} minutes'`))
    .select("id");
  for (const { id: jobId } of staleHeartbeatJobs) {
    await checkAllPagesDone(jobId).catch((err) =>
      logger.error("checkAllPagesDone failed during stale-heartbeat recheck", { jobId, error: err instanceof Error ? err.message : String(err) }));
  }

  if (stale.length > 0 || staleHeartbeatJobs.length > 0) {
    logger.info("Reclaim sweep complete", {
      staleItems: stale.length, failedOutright: failedOutright.size, staleHeartbeatJobsRechecked: staleHeartbeatJobs.length,
    });
  }
  return { staleItems: stale.length, failedOutright: failedOutright.size };
}

const POLL_MS = 5 * 60_000;

if (process.argv[2] === "--once") {
  let ok = true;
  try {
    await reclaimStaleQueueItems();
  } catch (err) {
    ok = false;
    logger.error("Reclaim sweep failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    await masterKnex.destroy();
  }
  process.exit(ok ? 0 : 1);
} else {
  logger.info(`Extraction queue reclaim worker started — sweeping every ${POLL_MS / 1000}s for items stale over ${STALE_MINUTES}min`);
  await reclaimStaleQueueItems();
  setInterval(() => {
    reclaimStaleQueueItems().catch((e) => logger.error("Reclaim sweep failed", { error: e instanceof Error ? e.message : String(e) }));
  }, POLL_MS);
}
