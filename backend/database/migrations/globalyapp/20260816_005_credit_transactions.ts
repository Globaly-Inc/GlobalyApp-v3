import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credit_transactions", (t) => {
    t.increments("id").primary();
    t.integer("wallet_id").unsigned().notNullable()
      .references("id").inTable("credit_wallets").onDelete("CASCADE");
    t.integer("amount").notNullable();
    t.text("balance_type").notNullable();
    t.text("reason").notNullable();
    t.text("reference_type").nullable();
    t.integer("reference_id").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`ALTER TABLE credit_transactions ADD CONSTRAINT chk_ct_balance_type CHECK (balance_type IN ('free', 'subscription', 'purchased'))`);
  await knex.raw(`ALTER TABLE credit_transactions ADD CONSTRAINT chk_ct_reason CHECK (reason IN ('signup_grant', 'message', 'purchase', 'admin_grant', 'subscription_grant'))`);
  await knex.raw(`ALTER TABLE credit_transactions ADD CONSTRAINT chk_ct_reference_type CHECK (reference_type IS NULL OR reference_type IN ('ai_message', 'purchase'))`);

  await knex.raw(`CREATE INDEX idx_credit_transactions_wallet ON credit_transactions (wallet_id, created_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("credit_transactions");
}
