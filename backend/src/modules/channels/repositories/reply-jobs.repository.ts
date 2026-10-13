// Pending AI replies, one per channel conversation (globalyapp.channel_reply_jobs). See the
// 20261013_001 migration for why each message reschedules a row instead of answering at once, and
// 20261013_002 for the lease that keeps a reply alive through a worker crash.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";

const TABLE = "channel_reply_jobs";

/** Claims after this many tries (each claim counts, so a reply that crashes the worker too) are
 *  left alone until the customer writes again, which resets the count. */
export const MAX_REPLY_ATTEMPTS = 5;

export interface ReplyJob {
  id: number;
  owner_kind: Recipient["kind"];
  owner_id: number;
  visitor_id: number;
  first_message_at: Date;
  /** Including this claim. */
  attempts: number;
  version: number;
}

/**
 * Debounce: (re)schedule the conversation's reply `waitMs` from now, never past `maxWaitMs` after
 * the burst's first message — on the first message too. `waitMs` 0 = answer as soon as the worker
 * looks (Resume AI). A message landing while a reply is being written starts a new burst: the job
 * stays leased (no second reply runs alongside), and the version bump keeps it from being deleted
 * when that reply finishes.
 */
export async function scheduleReply(owner: Recipient, visitorId: number, waitMs: number, maxWaitMs: number): Promise<void> {
  const wait = `${Math.max(0, Math.min(waitMs, maxWaitMs))} milliseconds`;
  // Typed casts on every bind: an untyped parameter inside LEAST() can't be typed by Postgres.
  await masterKnex.raw(
    `INSERT INTO channel_reply_jobs AS j (owner_kind, owner_id, visitor_id, due_at)
     VALUES (?, ?, ?, now() + CAST(? AS interval))
     ON CONFLICT (owner_kind, owner_id, visitor_id) DO UPDATE SET
       version = j.version + 1,
       attempts = 0,
       first_message_at = CASE WHEN j.claimed_until > now() THEN now() ELSE j.first_message_at END,
       due_at = CASE WHEN j.claimed_until > now() THEN EXCLUDED.due_at
                     ELSE LEAST(EXCLUDED.due_at, j.first_message_at + CAST(? AS interval)) END`,
    [owner.kind, owner.id, visitorId, wait, `${Math.max(0, maxWaitMs)} milliseconds`],
  );
}

/**
 * Leases up to `limit` due replies, oldest first, for `leaseMs`. Two workers can't lease the same
 * job; a worker that dies leaves the lease to run out, and the reply is answered by a later poll.
 */
export async function claimDueReplies(limit: number, leaseMs: number): Promise<ReplyJob[]> {
  if (limit <= 0) return [];
  const res = await masterKnex.raw(
    `UPDATE channel_reply_jobs SET claimed_until = now() + CAST(? AS interval), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM channel_reply_jobs
       WHERE due_at <= now() AND (claimed_until IS NULL OR claimed_until <= now()) AND attempts < CAST(? AS integer)
       ORDER BY due_at ASC LIMIT CAST(? AS integer)
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, owner_kind, owner_id, visitor_id, first_message_at, attempts, version`,
    [`${leaseMs} milliseconds`, MAX_REPLY_ATTEMPTS, limit],
  );
  return res.rows as ReplyJob[];
}

/**
 * Done with a leased reply (sent, not owed, or given up). Deleted only if no message arrived while
 * it ran; otherwise the lease is dropped and the newer burst's own due time stands.
 */
export async function finishReply(job: ReplyJob): Promise<void> {
  const deleted = await masterKnex(TABLE).where({ id: job.id, version: job.version }).del();
  if (!deleted) await masterKnex(TABLE).where({ id: job.id }).update({ claimed_until: null });
}

/** Put a leased reply back for another try in `delayMs` (a failure, or the conversation is busy). */
export async function retryReply(job: ReplyJob, delayMs: number): Promise<void> {
  await masterKnex(TABLE).where({ id: job.id }).update({
    claimed_until: null,
    due_at: masterKnex.raw("GREATEST(due_at, now() + CAST(? AS interval))", [`${delayMs} milliseconds`]),
  });
}
