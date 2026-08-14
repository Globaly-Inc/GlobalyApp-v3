// Migration: extraction_banking table
// Student bank accounts and financial services

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_banking", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable(); // product name e.g. "Student Everyday Account"
    t.text("provider_name").nullable(); // bank name
    t.text("type").nullable(); // savings, everyday, term_deposit, money_transfer, credit_card, prepaid_card
    t.text("account_type").nullable(); // transaction, savings, combined, foreign_currency
    t.text("product_code").nullable();
    t.text("description").nullable();

    // Fees
    t.decimal("monthly_fee", null).nullable();
    t.decimal("annual_fee", null).nullable();
    t.text("fee_currency").nullable();
    t.boolean("fee_waiver_available").nullable();
    t.text("fee_waiver_conditions").nullable();
    t.decimal("atm_fee_domestic", null).nullable();
    t.decimal("atm_fee_international", null).nullable();
    t.decimal("international_transaction_fee_percent", null).nullable();
    t.decimal("overdraft_fee", null).nullable();
    t.decimal("card_replacement_fee", null).nullable();
    t.decimal("transfer_fee_domestic", null).nullable();
    t.decimal("transfer_fee_international", null).nullable();
    t.decimal("monthly_fee_waived_under_age", null).nullable(); // e.g. no fee if under 25

    // Interest
    t.decimal("interest_rate", null).nullable();
    t.text("interest_type").nullable(); // variable, fixed, tiered
    t.decimal("bonus_interest_rate", null).nullable();
    t.text("bonus_interest_conditions").nullable();
    t.text("interest_calculation_method").nullable(); // daily, monthly
    t.text("interest_paid_frequency").nullable(); // monthly, quarterly, annually

    // Card & access
    t.boolean("has_debit_card").nullable();
    t.text("card_type").nullable(); // visa, mastercard, eftpos
    t.boolean("has_mobile_app").nullable();
    t.boolean("has_internet_banking").nullable();
    t.boolean("has_branch_access").nullable();
    t.integer("branch_count").nullable();
    t.text("atm_network").nullable();
    t.boolean("contactless_payments").nullable();
    t.boolean("has_apple_pay").nullable();
    t.boolean("has_google_pay").nullable();
    t.boolean("has_samsung_pay").nullable();
    t.boolean("has_payid").nullable();
    t.boolean("has_bpay").nullable();
    t.boolean("has_international_transfers").nullable();
    t.boolean("foreign_currency_account").nullable();
    t.boolean("joint_account_available").nullable();
    t.boolean("linked_savings").nullable();

    // Features
    t.jsonb("features").nullable().defaultTo("[]");
    t.boolean("real_time_notifications").nullable();
    t.boolean("spending_insights").nullable();
    t.boolean("round_up_savings").nullable();
    t.boolean("budgeting_tools").nullable();
    t.boolean("instant_card_freeze").nullable();

    // Eligibility & requirements
    t.jsonb("eligibility").nullable().defaultTo("[]");
    t.integer("min_age").nullable();
    t.integer("max_age").nullable();
    t.specificType("visa_types_accepted", "text[]").nullable();
    t.decimal("min_deposit", null).nullable();
    t.decimal("min_balance", null).nullable();
    t.jsonb("documents_required").nullable().defaultTo("[]");
    t.boolean("can_open_before_arrival").nullable();
    t.boolean("requires_tax_file_number").nullable();

    // Limits
    t.decimal("daily_transfer_limit", null).nullable();
    t.decimal("daily_withdrawal_limit", null).nullable();
    t.decimal("daily_purchase_limit", null).nullable();
    t.decimal("minimum_balance", null).nullable();

    // Promotions
    t.decimal("sign_up_bonus", null).nullable();
    t.text("sign_up_bonus_currency").nullable();
    t.text("sign_up_bonus_conditions").nullable();
    t.date("promotion_expiry").nullable();

    // Location
    t.text("country_code").nullable();
    t.specificType("available_states", "text[]").nullable();
    t.text("branch_locator_url").nullable();

    // Contact
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("website").nullable();
    t.text("apply_url").nullable();

    // Meta
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_banking_job_idx ON ${s}.extraction_banking (job_id)`);
  await knex.raw(`CREATE INDEX extraction_banking_status_idx ON ${s}.extraction_banking (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_banking");
}
