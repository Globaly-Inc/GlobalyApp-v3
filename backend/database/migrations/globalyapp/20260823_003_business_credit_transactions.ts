import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_credit_transactions", (t) => {
    t.increments("id").primary();
    t.integer("wallet_id").unsigned().notNullable()
      .references("id").inTable("business_credit_wallets").onDelete("CASCADE");
    t.integer("amount").notNullable();
    t.text("reason").notNullable();
    t.text("reference_type").nullable();
    t.text("reference_id").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `ALTER TABLE business_credit_transactions ADD CONSTRAINT chk_bct_reason
       CHECK (reason IN ('signup_grant', 'enquiry_unlock', 'unlock_refund', 'purchase', 'admin_grant', 'subscription_grant'))`,
  );
  await knex.raw(
    `ALTER TABLE business_credit_transactions ADD CONSTRAINT chk_bct_reference_type
       CHECK (reference_type IS NULL OR reference_type IN ('enquiry_distribution', 'stripe_subscription', 'stripe_checkout_session'))`,
  );
  await knex.raw(
    `CREATE INDEX idx_business_credit_transactions_wallet ON business_credit_transactions (wallet_id, created_at)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_credit_transactions");
}
