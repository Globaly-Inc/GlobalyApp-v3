// Billing accounts — wallets, ledger, subscriptions, AI credit periods, webhook log.
//
// ── Why these live in the MASTER schema and not in each tenant schema ──
//
//  1. Not all of them have a tenant. 20 of V1's 55 `credit_wallets` are personal
//     (owner_type='user') and belong to a platform user who may own no business at
//     all. A tenant schema has nowhere to put those rows.
//  2. The platform operator queries them across every business. The admin surface
//     in scope (subscriber list, cross-business credit ledger, revenue reporting,
//     reconciliation) would otherwise fan out one query per tenant schema and
//     UNION ALL the results — the same anti-pattern `verify-migration`'s
//     schemaExpand exists to work around, on a page that runs constantly.
//  3. Stripe webhooks arrive with no tenant context — only a customer/subscription
//     id. Resolving that to a schema requires a master-level index anyway, so
//     splitting the record across two places buys nothing.
//  4. Money must outlive the tenant. Dropping or restoring a business schema is a
//     routine operation; losing its payment history is not.
//  5. `businesses.subscription_id` / `customer_id` / `plan_code` (20260804_001)
//     are already master columns. Keeping the subscription row beside them makes
//     the join local instead of cross-schema.
//
// Per-business isolation is therefore enforced in the repository layer (every
// query is keyed by business_id, resolved from req.auth.orgId), not by search_path.

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

const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "expired"] as const;

export async function up(knex: Knex): Promise<void> {
  // ── credit_wallets (V1: 55 — 35 business, 20 personal) ──
  await knex.schema.createTable("credit_wallets", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.text("owner_type").notNullable().checkIn(["user", "business"], "credit_wallets_owner_type_check");
    t.integer("platform_user_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    t.integer("balance").notNullable().defaultTo(0);
    t.integer("subscription_balance").notNullable().defaultTo(0);
    t.integer("purchased_balance").notNullable().defaultTo(0);
    t.integer("lifetime_earned").notNullable().defaultTo(0);
    t.integer("lifetime_spent").notNullable().defaultTo(0);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    // Exactly one owner, matching owner_type.
    t.check(
      "(owner_type = 'business' AND business_id IS NOT NULL AND platform_user_id IS NULL)" +
        " OR (owner_type = 'user' AND platform_user_id IS NOT NULL AND business_id IS NULL)",
      [],
      "credit_wallets_owner_check",
    );
    t.check("balance = subscription_balance + purchased_balance", [], "credit_wallets_balance_split_check");
    // The invariant the concurrency test asserts. Application code guards with a
    // conditional UPDATE; this is the backstop that makes a negative balance
    // unrepresentable no matter which path writes the row.
    t.check(
      "balance >= 0 AND subscription_balance >= 0 AND purchased_balance >= 0" +
        " AND lifetime_earned >= 0 AND lifetime_spent >= 0",
      [],
      "credit_wallets_non_negative_check",
    );
  });

  await knex.raw(
    `CREATE UNIQUE INDEX credit_wallets_business_unique ON credit_wallets (business_id)
       WHERE business_id IS NOT NULL AND deleted_at IS NULL`,
  );
  await knex.raw(
    `CREATE UNIQUE INDEX credit_wallets_user_unique ON credit_wallets (platform_user_id)
       WHERE platform_user_id IS NOT NULL AND deleted_at IS NULL`,
  );

  // ── credit_transactions (V1: 162) ──
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

    t.text("description").nullable();
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

  // ── business_subscriptions (V1: 33, one per business) ──
  await knex.schema.createTable("business_subscriptions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("plan_id").unsigned().notNullable()
      .references("id").inTable("subscription_plans");

    t.text("status").notNullable().defaultTo("trialing")
      .checkIn([...SUBSCRIPTION_STATUSES], "business_subscriptions_status_check");
    t.text("billing_interval").notNullable().defaultTo("month")
      .checkIn(["month", "year"], "business_subscriptions_billing_interval_check");

    t.text("stripe_subscription_id").nullable();
    t.text("stripe_customer_id").nullable();

    t.timestamp("current_period_start").nullable();
    t.timestamp("current_period_end").nullable();
    t.timestamp("trial_ends_at").nullable();
    t.timestamp("canceled_at").nullable();
    t.timestamp("downgrade_at").nullable();

    // Snapshotted from the plan at purchase time — the plan may change later.
    t.integer("monthly_credit_grant").notNullable().defaultTo(0);
    t.integer("personal_credit_per_member").notNullable().defaultTo(0);

    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index("stripe_customer_id", "business_subscriptions_stripe_customer_idx");
  });

  await knex.raw(
    `CREATE UNIQUE INDEX business_subscriptions_business_unique ON business_subscriptions (business_id)
       WHERE deleted_at IS NULL`,
  );
  await knex.raw(
    `CREATE UNIQUE INDEX business_subscriptions_stripe_sub_unique ON business_subscriptions (stripe_subscription_id)
       WHERE stripe_subscription_id IS NOT NULL`,
  );

  // ── business_ai_credits (V1: 4) — per-period AI allowance, separate from the wallet ──
  await knex.schema.createTable("business_ai_credits", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.date("period_start").notNullable();
    t.date("period_end").notNullable();
    t.integer("granted").notNullable().defaultTo(0);
    t.integer("used").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["business_id", "period_start"], { indexName: "business_ai_credits_period_unique" });
    t.check("granted >= 0 AND used >= 0", [], "business_ai_credits_non_negative_check");
  });

  // ── billing_events — the webhook de-duplication log ──
  // A provider event id is inserted in the SAME transaction that settles it, so a
  // redelivery finds the row and does nothing, and a crash mid-settle rolls back
  // both the marker and the partial settlement.
  await knex.schema.createTable("billing_events", (t) => {
    t.increments("id").primary();
    t.text("provider").notNullable().defaultTo("stripe");
    t.text("event_id").notNullable();
    t.text("event_type").notNullable();
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("SET NULL");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamp("processed_at").notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.unique(["provider", "event_id"], { indexName: "billing_events_provider_event_unique" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("billing_events");
  await knex.schema.dropTableIfExists("business_ai_credits");
  await knex.schema.dropTableIfExists("business_subscriptions");
  await knex.schema.dropTableIfExists("credit_transactions");
  await knex.schema.dropTableIfExists("credit_wallets");
}
