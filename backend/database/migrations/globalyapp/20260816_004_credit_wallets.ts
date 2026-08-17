// credit_wallets — ONE polymorphic wallet table, shaped from V1.
//
// V1 `public.credit_wallets` is a single polymorphic table (55 rows: 35
// owner_type='business', 20 owner_type='user'), so V3 has one too. Both the
// billing module and the AI-counsellor read this table; there is no second
// user-only wallet table.
//
// ── balance composition ──
// `balance` = subscription_balance + purchased_balance. This is V1's own
// `balance_check` constraint, verified true on all 55 V1 rows, and it is what
// the billing SQL (debitWallet / creditWallet) already maintains.
//
// `free_balance` is a V3 addition for AI-chat signup credits and is deliberately
// OUTSIDE `balance`: it is a promotional grant, not money that was ever paid or
// invoiced, so it must not inflate `balance` on the admin revenue/ledger views.
// The AI-counsellor's own API keeps reporting the spendable total as
// free + subscription + purchased.
//
// ── uniqueness ──
// V1 used UNIQUE (owner_type, business_id) / (owner_type, user_id), which lets
// unlimited rows through whenever the owner column is NULL. V3 uses partial
// unique indexes on the owner column itself, which is the rule V1 meant: at most
// one live wallet per owner.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credit_wallets", (t) => {
    t.increments("id").primary();
    // V1 ids are uuids; carried so the V1 import can re-run idempotently.
    t.uuid("v1_id").nullable().unique();

    t.text("owner_type").notNullable().checkIn(["user", "business"], "credit_wallets_owner_type_check");
    t.integer("platform_user_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    t.integer("balance").notNullable().defaultTo(0);
    t.integer("subscription_balance").notNullable().defaultTo(0);
    t.integer("purchased_balance").notNullable().defaultTo(0);
    // V3-only bucket: AI-chat signup credits. Not part of `balance`.
    t.integer("free_balance").notNullable().defaultTo(0);
    t.integer("lifetime_earned").notNullable().defaultTo(0);
    t.integer("lifetime_spent").notNullable().defaultTo(0);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    // Exactly one owner column set, and it agrees with owner_type.
    t.check(
      "(owner_type = 'business' AND business_id IS NOT NULL AND platform_user_id IS NULL)" +
        " OR (owner_type = 'user' AND platform_user_id IS NOT NULL AND business_id IS NULL)",
      [],
      "credit_wallets_owner_check",
    );
    // V1's balance_check, verbatim. free_balance is excluded by design (see header).
    t.check("balance = subscription_balance + purchased_balance", [], "credit_wallets_balance_split_check");
    // The invariant the billing concurrency test asserts. Application code guards
    // with a conditional UPDATE under FOR UPDATE; this is the backstop that makes
    // a negative balance unrepresentable no matter which path writes the row.
    t.check(
      "balance >= 0 AND subscription_balance >= 0 AND purchased_balance >= 0" +
        " AND free_balance >= 0 AND lifetime_earned >= 0 AND lifetime_spent >= 0",
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
}

export async function down(knex: Knex): Promise<void> {
  // Indexes and constraints go with the table.
  await knex.schema.dropTableIfExists("credit_wallets");
}
