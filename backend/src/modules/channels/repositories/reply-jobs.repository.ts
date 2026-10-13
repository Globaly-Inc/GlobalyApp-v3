// Pending AI replies, one per channel conversation (globalyapp.channel_reply_jobs). See the
// 20261013_001 migration for why each message reschedules a row instead of answering at once.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";

const TABLE = "channel_reply_jobs";

export interface ReplyJob {
  owner_kind: Recipient["kind"];
  owner_id: number;
  visitor_id: number;
  first_message_at: Date;
  attempts: number;
}

/**
 * Debounce: (re)schedule the conversation's reply `waitMs` from now. A new message pushes it back,
 * but never past `maxWaitMs` after the burst's first message. `waitMs` 0 = answer as soon as the
 * worker looks (Resume AI).
 */
export async function scheduleReply(owner: Recipient, visitorId: number, waitMs: number, maxWaitMs: number): Promise<void> {
  // Typed casts on every bind: an untyped parameter inside LEAST() can't be typed by Postgres.
  await masterKnex.raw(
    `INSERT INTO channel_reply_jobs (owner_kind, owner_id, visitor_id, due_at)
     VALUES (?, ?, ?, now() + CAST(? AS interval))
     ON CONFLICT (owner_kind, owner_id, visitor_id) DO UPDATE
     SET due_at = LEAST(EXCLUDED.due_at, channel_reply_jobs.first_message_at + CAST(? AS interval))`,
    [owner.kind, owner.id, visitorId, `${Math.max(0, waitMs)} milliseconds`, `${Math.max(0, maxWaitMs)} milliseconds`],
  );
}

/**
 * Takes up to `limit` due replies, oldest first, by deleting them: whoever deletes a row owns that
 * reply, so two sweeps (or two workers) can never answer the same burst. A message arriving after
 * the claim inserts a fresh row and is answered by it.
 */
export async function claimDueReplies(limit: number): Promise<ReplyJob[]> {
  if (limit <= 0) return [];
  const res = await masterKnex.raw(
    `DELETE FROM channel_reply_jobs
     WHERE id IN (
       SELECT id FROM channel_reply_jobs WHERE due_at <= now()
       ORDER BY due_at ASC LIMIT CAST(? AS integer)
       FOR UPDATE SKIP LOCKED
     )
     RETURNING owner_kind, owner_id, visitor_id, first_message_at, attempts`,
    [limit],
  );
  return res.rows as ReplyJob[];
}

/**
 * Puts a claimed reply back: after a failure (later, with `attempts` counted) or because this
 * conversation is already being answered (shortly). A newer row for the conversation wins.
 */
export async function requeueReply(job: ReplyJob, delayMs: number, failed: boolean): Promise<void> {
  await masterKnex(TABLE)
    .insert({
      owner_kind: job.owner_kind,
      owner_id: job.owner_id,
      visitor_id: job.visitor_id,
      first_message_at: job.first_message_at,
      due_at: new Date(Date.now() + delayMs),
      attempts: job.attempts + (failed ? 1 : 0),
    })
    .onConflict(["owner_kind", "owner_id", "visitor_id"])
    .ignore();
}
