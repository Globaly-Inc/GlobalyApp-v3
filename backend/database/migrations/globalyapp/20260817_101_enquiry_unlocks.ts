// enquiry_unlocks — the unlock ledger. One row = one lead, paid for once.
//
// Master (`public`), because it hangs off `enquiry_distributions` and points at
// `credit_transactions`, both of which are master for the reasons in
// 20260817_100 and 20260816_005.
//
// ── this table IS the exactly-once mechanism ──
// V1 guarded double-unlock with `if (distribution.is_unlocked)` read from a row
// it had already SELECTed — a read-then-write race that charges twice when two
// members of the same business click at the same moment. V3 does not guard in
// application code at all: `distribution_id` is UNIQUE, and the unlock path
// INSERTs here FIRST, inside the same transaction that later debits the wallet.
//   * two concurrent unlocks → the loser blocks on the index until the winner
//     commits, then conflicts and is told "already unlocked", without paying;
//   * insufficient credits → the debit throws, the whole transaction rolls back,
//     and this row disappears with it, so the next attempt is free to retry.
//
// The UNIQUE is deliberately NOT partial on `deleted_at`. Soft-deleting an
// unlock must not re-open the charge; a refund is a new credit_transactions row,
// not a resurrected unlock. `deleted_at` exists only because the module family
// carries it.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_unlocks", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("distribution_id").unsigned().notNullable().unique()
      .references("id").inTable("enquiry_distributions").onDelete("CASCADE");
    // Denormalised from the distribution so the admin ledger and the
    // "who has unlocked this lead" read never need the join.
    t.integer("enquiry_id").unsigned().notNullable()
      .references("id").inTable("enquiries").onDelete("CASCADE");
    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    // V1 unlocked_by. Nullable because the actor may later be deleted.
    t.integer("unlocked_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.integer("credits_spent").notNullable();
    // The billing row this unlock paid for. SET NULL rather than CASCADE: losing
    // the ledger row must never silently un-charge the lead.
    t.integer("credit_transaction_id").unsigned().nullable()
      .references("id").inTable("credit_transactions").onDelete("SET NULL");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["business_id", "created_at"], "enquiry_unlocks_business_created_idx");
    t.index(["enquiry_id"], "enquiry_unlocks_enquiry_idx");
    t.check("credits_spent >= 0", [], "enquiry_unlocks_credits_spent_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_unlocks");
}
