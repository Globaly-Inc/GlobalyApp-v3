// Credit ledger — the append-only store behind the superadmin "Credit Ledger" surface.
//
// Referrals is its first writer, but this is deliberately not a referral table: purchases and
// manual admin adjustments land here too.
//
// This is the ONLY credit table. The wallet pair added in staging (credit_wallets +
// a wallet-scoped credit_transactions) was folded in here: `balance_type` below carries the
// free/subscription/purchased split the AI counsellor needs, so the waterfall works off ledger rows
// instead of three cached balance columns.
//
// ponytail: balance is SUM(amount) — no wallets table and no cached balance column, so there is
// nothing that can drift out of sync with the rows.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credit_transactions", (t) => {
    t.increments("id").primary();

    // Polymorphic owner. Deliberately NO foreign key: a per-type FK would drag cascade semantics
    // into financial history, and `user #7` / `business #7` legitimately coexist. Owner existence
    // is validated in credits.repository.addTransaction instead.
    t.text("owner_type").notNullable();
    t.integer("owner_id").notNullable();

    // Signed: +20 award, -20 reversal. A reversal is a NEW row, never an update.
    t.integer("amount").notNullable();

    t.text("kind").notNullable();

    // Which pot the credits belong to. Grants say where credits land; spends say where they came
    // from, so the AI waterfall (free -> subscription -> purchased) is answerable from rows alone.
    // Defaulted because every non-AI kind — referrals, purchases, adjustments — lands in "free".
    t.text("balance_type").notNullable().defaultTo("free");

    // ('referral', referrals.id) for referral rows. This pair is the AUTHORITATIVE link between a
    // referral and its money — referrals.credit_transaction_id is only a convenience pointer.
    t.text("reference_type").nullable();
    t.integer("reference_id").nullable();

    t.text("description").nullable(); // user-facing row label, e.g. "Referral reward"
    t.text("note").nullable();        // internal
    t.integer("created_by").nullable(); // acting admin, for manual adjustments

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE credit_transactions
      ADD CONSTRAINT credit_tx_owner_type_check CHECK (owner_type IN ('user', 'business')),
      ADD CONSTRAINT credit_tx_kind_check CHECK (
        kind IN (
          'referral_reward', 'referral_reversal', 'purchase', 'manual_adjustment',
          -- AI counsellor credits, formerly credit_transactions.reason
          'ai_message', 'signup_grant', 'subscription_grant', 'admin_grant'
        )
      ),
      ADD CONSTRAINT credit_tx_balance_type_check CHECK (
        balance_type IN ('free', 'subscription', 'purchased')
      ),
      ADD CONSTRAINT credit_tx_amount_nonzero CHECK (amount <> 0)
  `);

  // `id` last so the running-balance window function
  //   SUM(amount) OVER (PARTITION BY owner_type, owner_id ORDER BY id)
  // can read in index order.
  await knex.raw(`
    CREATE INDEX credit_tx_owner_idx ON credit_transactions (owner_type, owner_id, id)
  `);

  // INV-2 — one referral can never produce two reward rows.
  //
  // Scoped to kind='referral_reward' on purpose: a referral_reversal (Phase 3) carries the SAME
  // reference_id and must be allowed to coexist. This is the second, independent line of defence
  // behind the atomic state transition in qualification.service.attemptAward.
  await knex.raw(`
    CREATE UNIQUE INDEX credit_tx_one_referral_reward
      ON credit_transactions (reference_id)
      WHERE reference_type = 'referral' AND kind = 'referral_reward'
  `);

  // Exactly one signup grant per owner, ever.
  //
  // This carries the idempotency that credit_wallets.UNIQUE(platform_user_id) used to provide: the
  // grant was previously safe because creating the wallet twice was impossible. With no wallet row,
  // two concurrent first-messages would each insert a +10 grant, so the constraint moves here.
  await knex.raw(`
    CREATE UNIQUE INDEX credit_tx_one_signup_grant
      ON credit_transactions (owner_type, owner_id)
      WHERE kind = 'signup_grant'
  `);

  // Append-only, ENFORCED rather than merely documented.
  //
  // A trigger, not REVOKE: the app connects as the schema owner (one DB_USERNAME for everything —
  // see knexfile.ts), so table grants would be bypassed by ownership and would also break
  // migrations. FOR EACH STATEMENT costs nothing on INSERT.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION credit_transactions_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'credit_transactions is append-only (attempted %)', TG_OP;
    END $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER credit_tx_no_update_or_delete
      BEFORE UPDATE OR DELETE ON credit_transactions
      FOR EACH STATEMENT EXECUTE FUNCTION credit_transactions_append_only()
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Trigger, then function, then table.
  await knex.raw("DROP TRIGGER IF EXISTS credit_tx_no_update_or_delete ON credit_transactions");
  await knex.raw("DROP FUNCTION IF EXISTS credit_transactions_append_only()");
  await knex.schema.dropTableIfExists("credit_transactions");
}
