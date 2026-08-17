// Migration: extraction_insurance table
// Health, travel, OSHC, OVHC insurance products

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_insurance", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // oshc, ovhc, health, travel, combined, life, income_protection
    t.text("plan_tier").nullable(); // basic, standard, premium, top
    t.text("product_code").nullable();
    t.text("description").nullable();

    // Cover details
    t.text("cover_type").nullable(); // single, couple, family, single_parent
    t.integer("age_min").nullable();
    t.integer("age_max").nullable();
    t.integer("dependants_max").nullable();

    // Pricing
    t.decimal("premium_amount", null).nullable();
    t.text("premium_currency").nullable();
    t.text("premium_period").nullable(); // per_month, per_quarter, per_year, per_visa_length, total
    t.decimal("premium_annual", null).nullable();
    t.decimal("premium_monthly", null).nullable();
    t.text("payment_frequency").nullable(); // monthly, quarterly, annually, upfront
    t.decimal("discount_percent", null).nullable();
    t.text("discount_conditions").nullable();

    // Duration
    t.integer("cover_duration_months").nullable();
    t.date("cover_start_date").nullable();
    t.date("cover_end_date").nullable();
    t.boolean("flexible_start").nullable();
    t.boolean("auto_renewal").nullable();

    // Benefits & coverage
    t.jsonb("benefits").nullable().defaultTo("[]"); // detailed coverage items
    t.boolean("hospital_cover").nullable();
    t.boolean("extras_cover").nullable();
    t.boolean("dental_cover").nullable();
    t.boolean("optical_cover").nullable();
    t.boolean("physiotherapy_cover").nullable();
    t.boolean("mental_health_cover").nullable();
    t.boolean("ambulance_cover").nullable();
    t.boolean("prescription_cover").nullable();
    t.boolean("pregnancy_cover").nullable();
    t.boolean("emergency_cover").nullable();
    t.boolean("repatriation_cover").nullable();
    t.decimal("annual_limit", null).nullable();
    t.decimal("lifetime_limit", null).nullable();
    t.text("annual_limit_currency").nullable();

    // Exclusions & conditions
    t.jsonb("exclusions").nullable().defaultTo("[]");
    t.text("waiting_period").nullable();
    t.text("waiting_period_details").nullable();
    t.decimal("excess_amount", null).nullable();
    t.text("excess_currency").nullable();
    t.boolean("gap_cover").nullable();
    t.boolean("pre_existing_conditions_covered").nullable();
    t.text("pre_existing_conditions_details").nullable();

    // Compliance
    t.boolean("meets_visa_requirement").nullable();
    t.boolean("government_approved").nullable();
    t.text("fund_code").nullable();
    t.text("regulator").nullable(); // e.g. APRA, PHIO

    // Claims
    t.text("claiming_process").nullable();
    t.text("claims_phone").nullable();
    t.text("claims_email").nullable();
    t.text("claims_portal_url").nullable();

    // Location
    t.text("country_code").nullable();
    t.specificType("states_covered", "text[]").nullable();
    t.specificType("countries_covered", "text[]").nullable();
    t.specificType("visa_types_eligible", "text[]").nullable();

    // Contact
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("website").nullable();
    t.text("quote_url").nullable();
    t.text("apply_url").nullable();
    t.text("pds_url").nullable(); // product disclosure statement

    // Comparison
    t.text("comparison_url").nullable();
    t.text("fact_sheet_url").nullable();

    // Meta
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_insurance_job_idx ON ${s}.extraction_insurance (job_id)`);
  await knex.raw(`CREATE INDEX extraction_insurance_status_idx ON ${s}.extraction_insurance (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_insurance");
}
