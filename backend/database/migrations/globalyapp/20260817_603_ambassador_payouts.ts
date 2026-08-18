// The ambassador money ledger: earnings in, payouts out. Wave G4.
//
// Spec: V1 `process-ambassador-payout` + V2 routes/ambassador.ts's earnings/
// payouts projections.
//
// ── why this is a ledger and not two counters ──
// V1 did this: SELECT ambassador → INSERT payout('processing') → Stripe transfer
// → UPDATE payout('completed') → UPDATE ambassadors SET available_earnings =
// <value read before the transfer> - amount → UPDATE earnings SET withdrawn.
// Five unsynchronised writes with a network call in the middle. Two concurrent
// withdrawals both read the same balance and both succeed; a crash after the
// transfer leaves money moved and the balance untouched.
//
// V3 mirrors `enquiry_unlocks` (20260817_101), the pattern this database already
// uses for exactly-once money:
//   * `idempotency_key` is NOT NULL UNIQUE. The payout row is INSERTed FIRST,
//     inside the transaction that later debits the balance. A replay of the same
//     request conflicts on the index and is answered with the original payout
//     instead of moving money twice.
//   * The Stripe call happens inside that transaction. With no key configured it
//     raises 503 and the whole transaction rolls back — no payout row, no debit,
//     no half-withdrawn earnings — so the caller may simply retry.
//   * `ambassadors.available_earnings_minor` carries a >= 0 check, so an
//     overdraw aborts rather than writing a negative balance.
//
// ponytail: single-phase — the Stripe transfer is awaited while the transaction
// is open. That is correct and simple at ambassador-payout volume (a handful a
// day). If transfer latency ever holds transactions long enough to matter, split
// into pending → settled and reconcile from the billing module's existing
// signature-verified webhook; `stripe_transfer_id` is already the join key.

import type { Knex } from "knex";

const EARNING_TYPES = ["inquiry_resolution", "referral", "bonus", "adjustment"] as const;
const EARNING_STATUSES = ["pending", "available", "withdrawn", "cancelled"] as const;
const PAYOUT_METHODS = ["stripe", "manual"] as const;
const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassador_payouts", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("ambassador_id").unsigned().notNullable()
      .references("id").inTable("ambassadors").onDelete("CASCADE");

    t.integer("amount_minor").notNullable();
    t.text("currency", 3).notNullable().defaultTo("AUD");
    t.text("method").notNullable().defaultTo("stripe")
      .checkIn([...PAYOUT_METHODS], "ambassador_payouts_method_check");
    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...PAYOUT_STATUSES], "ambassador_payouts_status_check");

    t.text("stripe_transfer_id").nullable().unique();
    // Settle-exactly-once key. See the header: this is the whole mechanism.
    t.text("idempotency_key").notNullable().unique();
    t.text("failure_reason").nullable();

    t.timestamp("requested_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("processed_at").nullable();
    t.timestamp("completed_at").nullable();
    t.timestamps(true, true);

    t.index(["ambassador_id", "created_at"], "ambassador_payouts_ambassador_created_idx");
    t.check("amount_minor > 0", [], "ambassador_payouts_amount_check");
  });

  await knex.schema.createTable("ambassador_earnings", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("ambassador_id").unsigned().notNullable()
      .references("id").inTable("ambassadors").onDelete("CASCADE");
    t.integer("inquiry_id").unsigned().nullable()
      .references("id").inTable("ambassador_inquiries").onDelete("SET NULL");

    t.text("type").notNullable()
      .checkIn([...EARNING_TYPES], "ambassador_earnings_type_check");
    // Gross, and net of the platform's cut. V1 paid out `net_amount`.
    t.integer("amount_minor").notNullable();
    t.integer("net_amount_minor").notNullable();
    t.text("currency", 3).notNullable().defaultTo("AUD");
    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...EARNING_STATUSES], "ambassador_earnings_status_check");

    // Losing a payout row must never silently un-withdraw an earning, hence
    // SET NULL rather than CASCADE (same reasoning as enquiry_unlocks).
    t.integer("payout_id").unsigned().nullable()
      .references("id").inTable("ambassador_payouts").onDelete("SET NULL");

    t.text("description").nullable();
    t.timestamp("available_at").nullable();
    t.timestamps(true, true);

    // One earning per resolved inquiry — resolving twice must not pay twice.
    t.unique(["inquiry_id", "type"], { indexName: "ambassador_earnings_inquiry_type_uniq" });
    t.index(["ambassador_id", "status"], "ambassador_earnings_ambassador_status_idx");
    t.check("net_amount_minor >= 0", [], "ambassador_earnings_net_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassador_earnings");
  await knex.schema.dropTableIfExists("ambassador_payouts");
}
