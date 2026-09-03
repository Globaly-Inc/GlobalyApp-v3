// Email queue repository — writes/reads against globalyapp.enquiry_email_queue.
// Dedup is the DB's UNIQUE(dedup_key) constraint (PRD §26/§32), not an
// app-level check-then-insert — ON CONFLICT DO NOTHING makes double-firing the
// same event (retry, redelivered message, double-click) a safe no-op.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

const T = "enquiry_email_queue";

export interface NewQueueRow {
  enquiry_id: string | null;
  distribution_id: string | null;
  business_id: number | null;
  recipient_user_id: number | null;
  recipient_email: string;
  template: string;
  payload: Record<string, unknown>;
  dedup_key: string;
}

/** Returns the inserted row, or undefined if dedup_key already existed (no-op, not an error). */
export async function insertIgnoreDup(row: NewQueueRow) {
  const [inserted] = await masterKnex(T).insert(row).onConflict("dedup_key").ignore().returning("*");
  return inserted as (NewQueueRow & { id: string; status: string; attempts: number }) | undefined;
}

export async function findByIdForUpdate(trx: Knex.Transaction, id: string) {
  return trx(T).where({ id }).forUpdate().first();
}

export interface QueueRow extends NewQueueRow {
  id: string;
  status: string;
  attempts: number;
  created_at: Date;
}

/**
 * Which (template, recipient_email) groups are due for a summary mail.
 *
 * The window is measured against the group's OLDEST pending row, not each row's own age:
 * once a group is due, `claimGroup` takes everything currently pending for it, including
 * rows queued seconds ago. That makes the window tumbling rather than sliding — a recipient
 * gets at most one mail per template per window, and a continuous stream of enquiries never
 * leaves a permanent un-sent tail behind the cutoff.
 *
 * No lock here: this is a worklist, and `claimGroup` is what actually decides ownership.
 */
export async function findReadyDigestGroups(
  templates: string[],
  windowMs: number,
  limit: number,
): Promise<{ recipient_email: string; template: string }[]> {
  return masterKnex(T)
    .where("status", "pending")
    .whereIn("template", templates)
    .groupBy("recipient_email", "template")
    .havingRaw("MIN(created_at) <= now() - (? || ' milliseconds')::interval", [String(windowMs)])
    .orderByRaw("MIN(created_at) ASC")
    .limit(limit)
    .select("recipient_email", "template");
}

/**
 * Takes ownership of one group — the whole group, not just the rows it returns — for the life
 * of the transaction. Returns [] when another sweep already owns it.
 *
 * The advisory lock is load-bearing, and row locks alone are NOT enough. `LIMIT n ... FOR
 * UPDATE SKIP LOCKED` only skips rows that are already locked, so when a recipient has more
 * than `limit` rows pending, a second overlapping sweep skips the first one's locked rows and
 * happily claims the remainder — then sends a SECOND summary for the same window, and sends it
 * concurrently, past the in-process rate limit that assumes serial sends. The lock is on the
 * group key so the second sweep gets nothing and moves on, which is what the digest promises:
 * one mail per recipient per window.
 *
 * `pg_try_advisory_xact_lock` (not the blocking variant) so a busy group is skipped rather
 * than queued behind another worker's SMTP round-trip; it releases on commit or rollback, so a
 * crashed sweep frees the group without a reaper. Same mechanism as
 * `superadmin/data-extraction/repositories/jobs.repository.ts`.
 */
export async function claimGroup(
  trx: Knex.Transaction,
  template: string,
  recipientEmail: string,
  limit: number,
): Promise<QueueRow[]> {
  const { rows } = await trx.raw("SELECT pg_try_advisory_xact_lock(hashtext(?)::bigint) AS locked", [
    `enquiry_digest:${template}:${recipientEmail.toLowerCase()}`,
  ]);
  if (!rows[0]?.locked) return [];

  return trx(T)
    .where({ status: "pending", template, recipient_email: recipientEmail })
    .orderBy("created_at", "asc")
    .limit(limit)
    .forUpdate()
    .skipLocked();
}

/** Pending rows for templates that are NOT batched — requeued retries of the immediate mails. */
export async function findPendingSingles(excludeTemplates: string[], limit: number): Promise<QueueRow[]> {
  return masterKnex(T)
    .where("status", "pending")
    .whereNotIn("template", excludeTemplates)
    .orderBy("created_at", "asc")
    .limit(limit);
}

/** Set-based `markSent` — one digest resolves its whole group in a single statement. */
export async function markSentMany(trx: Knex.Transaction, ids: string[]) {
  await trx(T)
    .whereIn("id", ids)
    .update({ status: "sent", sent_at: trx.fn.now(), updated_at: trx.fn.now(), attempts: trx.raw("attempts + 1") });
}

/** Set-based `markFailed` — same requeue-below-cap semantics, applied per row's own attempts. */
export async function markFailedMany(trx: Knex.Transaction, ids: string[], maxAttempts: number) {
  await trx(T)
    .whereIn("id", ids)
    .update({
      status: trx.raw("CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END", [maxAttempts]),
      attempts: trx.raw("attempts + 1"),
      updated_at: trx.fn.now(),
    });
}

export async function markSending(trx: Knex.Transaction, id: string) {
  await trx(T).where({ id }).update({ status: "sending", updated_at: trx.fn.now() });
}

export async function markSent(trx: Knex.Transaction, id: string) {
  await trx(T)
    .where({ id })
    .update({ status: "sent", sent_at: trx.fn.now(), updated_at: trx.fn.now(), attempts: trx.raw("attempts + 1") });
}

export async function markFailed(trx: Knex.Transaction, id: string, maxAttempts: number) {
  const row = await trx(T).where({ id }).first("attempts");
  const nextAttempts = (row?.attempts ?? 0) + 1;
  await trx(T)
    .where({ id })
    .update({
      status: nextAttempts >= maxAttempts ? "failed" : "pending",
      attempts: nextAttempts,
      updated_at: trx.fn.now(),
    });
}
