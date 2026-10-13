// Worker — processes stored Zernio webhook events: customer messages (and AI replies), delivery
// updates, connection changes.
//
// Run with: npm run job:channel-events
//
// One event at a time, in order (prefetch 1 plus a single in-process chain), so two messages in
// the same conversation can never be answered out of order or twice. ponytail: one global lane;
// shard by conversation if volume ever needs parallelism.
//
// The queue drops a message whose handler throws, and a publish can fail after the event was
// stored, so a sweep also picks up anything stored but unprocessed for over a minute.

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { CHANNEL_QUEUES } from "../consts.js";
import { answerPending, processEvent } from "../services/inbound.service.js";
import * as replyJobs from "../repositories/reply-jobs.repository.js";
import { config } from "../../../config.js";

const logger = createChildLogger("channel-events-worker");
const SWEEP_MS = 60_000;

let lane: Promise<unknown> = Promise.resolve();
/** Events already waiting in the lane or running: the queue and the sweep never line one up twice. */
const queued = new Set<number>();
function run(eventRowId: number): Promise<void> {
  if (queued.has(eventRowId)) return Promise.resolve();
  queued.add(eventRowId);
  const next = lane.then(() => processEvent(eventRowId)).finally(() => queued.delete(eventRowId));
  lane = next.catch((err) => logger.error("Event processing crashed", { eventRowId, err: err instanceof Error ? err.message : String(err) }));
  return next;
}

await queueService.consume(CHANNEL_QUEUES.EVENTS, async (msg) => {
  if (!msg) return;
  const { eventRowId } = JSON.parse(msg.content.toString()) as { eventRowId?: unknown };
  // A number or a numeric string (older messages carried pg's int8 string): both are a row id.
  const id = Number(eventRowId);
  if (Number.isSafeInteger(id) && id > 0) await run(id);
}, { noAck: false }, 1);

// A sweep can outlast the interval when the lane is slow (a model outage); the next one waits
// rather than selecting the same unfinished rows again.
let sweeping = false;
setInterval(async () => {
  if (sweeping) return;
  sweeping = true;
  try {
    const rows: { id: number }[] = await masterKnex("zernio_events")
      .whereNull("processed_at")
      // Never attempted (a lost publish, a worker that was down): eligible however old, once the
      // queue has had a minute to deliver it. Failed: only once its backoff has passed.
      .where("received_at", "<", new Date(Date.now() - SWEEP_MS))
      .where((q) => q.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", new Date()))
      // Due-time order: an event that keeps failing moves back each time, so it can't hold the
      // front of the line against newer work (idx_zernio_events_due).
      .orderByRaw("COALESCE(next_attempt_at, received_at) ASC")
      .limit(50)
      .select("id");
    for (const r of rows) await run(Number(r.id));
  } catch (err) {
    logger.warn("Sweep failed", { err: err instanceof Error ? err.message : String(err) });
  } finally {
    sweeping = false;
  }
}, SWEEP_MS);

// ---------------------------------------------------------------- debounced AI replies
//
// Events only store messages and (re)schedule a reply (channel_reply_jobs); this loop sends them.
// Replies run beside the event lane, not in it: a reply takes seconds, and a customer's next
// message must be stored meanwhile so the reply can see it and stand down (answer's supersede
// check). Never two replies for one conversation: a job is claimed by deleting it, and a
// conversation already being answered here has its new job put back for a moment.

const REPLY_POLL_MS = 1000;
const MAX_CONCURRENT_REPLIES = 5;
const MAX_REPLY_ATTEMPTS = 5;
const replying = new Set<string>();
const jobKey = (j: replyJobs.ReplyJob) => `${j.owner_kind}:${j.owner_id}:${j.visitor_id}`;

async function reply(job: replyJobs.ReplyJob): Promise<void> {
  const key = jobKey(job);
  if (replying.has(key)) return replyJobs.requeueReply(job, 2000, false);
  replying.add(key);
  try {
    // The burst has waited as long as it may: send even if the customer is still typing.
    const forced = Date.now() - new Date(job.first_message_at).getTime() >= config.CHANNEL_REPLY_MAX_WAIT_MS;
    await answerPending({ kind: job.owner_kind, id: job.owner_id }, job.visitor_id, { forced });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (job.attempts + 1 >= MAX_REPLY_ATTEMPTS) {
      logger.error("AI reply failed; giving up", { key, attempt: job.attempts + 1, err: message });
    } else {
      logger.warn("AI reply failed; will retry", { key, attempt: job.attempts + 1, err: message });
      await replyJobs.requeueReply(job, 30_000 * 2 ** job.attempts, true);
    }
  } finally {
    replying.delete(key);
  }
}

let polling = false;
setInterval(async () => {
  if (polling) return;
  polling = true;
  try {
    const jobs = await replyJobs.claimDueReplies(MAX_CONCURRENT_REPLIES - replying.size);
    // Not awaited: one slow reply must not hold the others, or the next poll.
    for (const job of jobs) void reply(job).catch((err) => logger.error("Reply loop crashed", { err: err instanceof Error ? err.message : String(err) }));
  } catch (err) {
    logger.warn("Reply poll failed", { err: err instanceof Error ? err.message : String(err) });
  } finally {
    polling = false;
  }
}, REPLY_POLL_MS);

logger.info(`Channel events worker started — consuming "${CHANNEL_QUEUES.EVENTS}" queue`);
