// credit_transactions — ONE ledger for both consumers (billing + AI-counsellor).
//
// Shaped from V1 `public.credit_transactions` (162 rows). `transaction_type` keeps
// V1's controlled vocabulary verbatim, so migrated rows and new rows share one
// language and the admin ledger can filter across both.
//
// `balance_type` and `reason` are V3-only columns the AI-counsellor writes to
// record which bucket a 1-credit chat spend came out of (V1 has no `free` bucket).
// They are nullable because billing rows and V1-imported rows carry the same
// information in `subscription_amount` / `purchased_amount` instead.
//
// `balance_after` is the wallet's spendable total after the row was applied, i.e.
// free_balance + balance. Business wallets never hold free credits, so for every
// billing write and every V1-imported row it is exactly `balance`.

import type { Knex } from "knex";

// V1 credit_transactions_transaction_type_check, carried over verbatim.
const TRANSACTION_TYPES = [
  "subscription_grant",
  "purchase",
  "enquiry_unlock",
  "ad_spend",
  "ai_deduct",
  "referral_reward",
  "profile_bonus",
  "refund",
  "manual_adjustment",
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credit_transactions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("wallet_id").unsigned().notNullable()
      .references("id").inTable("credit_wallets").onDelete("CASCADE");
    t.text("transaction_type").notNullable()
      .checkIn([...TRANSACTION_TYPES], "credit_transactions_transaction_type_check");

    // Signed: positive credits the wallet, negative debits it.
    t.integer("amount").notNullable();
    t.integer("balance_after").notNullable();
    t.integer("subscription_amount").nullable();
    t.integer("purchased_amount").nullable();

    // V3-only, AI-counsellor: which wallet bucket moved, and why.
    t.text("balance_type").nullable();
    t.text("reason").nullable();

    t.text("description").nullable();
    // Free text in V1 ('ai_counselor_session', 'stripe_session', 'enquiry', …).
    t.text("reference_type").nullable();
    t.text("reference_id").nullable();
    t.integer("performed_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    // Settle-exactly-once key. Every externally triggered write (Stripe webhook,
    // checkout verify) carries one; internal spends leave it null.
    t.text("idempotency_key").nullable().unique();

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.check("balance_after >= 0", [], "credit_transactions_balance_after_check");
    t.index(["wallet_id", "created_at"], "credit_transactions_wallet_created_idx");
  });

  await knex.raw(
    `ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_balance_type_check
       CHECK (balance_type IS NULL OR balance_type IN ('free', 'subscription', 'purchased'))`,
  );
  await knex.raw(
    `ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_reason_check
       CHECK (reason IS NULL OR reason IN ('signup_grant', 'message', 'purchase', 'admin_grant', 'subscription_grant'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("credit_transactions");
}
