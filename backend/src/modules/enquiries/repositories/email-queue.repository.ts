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

/** Other still-pending rows for the same recipient (excluding the row itself) — decides immediate-vs-batched send. */
export async function countOtherPendingForRecipient(opts: {
  businessId: number | null;
  recipientUserId: number | null;
  excludeId: string;
}): Promise<number> {
  let q = masterKnex(T).where("status", "pending").andWhereNot("id", opts.excludeId);
  if (opts.businessId != null) q = q.andWhere("business_id", opts.businessId);
  else if (opts.recipientUserId != null) q = q.andWhere("recipient_user_id", opts.recipientUserId);
  else return 0;
  const [{ count }] = await q.count("id");
  return Number(count);
}

export async function findByIdForUpdate(trx: Knex.Transaction, id: string) {
  return trx(T).where({ id }).forUpdate().first();
}

/** Batch sweep pick-up: oldest pending rows first, capped. */
export async function claimPendingBatch(limit: number) {
  return masterKnex(T).where("status", "pending").orderBy("created_at", "asc").limit(limit);
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
