// Migration: extraction_visa_services table
// Visa application assistance and migration services (distinct from extraction_visas which stores visa types)

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_visa_services", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // visa_application, migration_advice, appeal, review, sponsorship, skills_assessment, citizenship
    t.text("description").nullable();

    // Registration
    t.text("registration_number").nullable(); // MARN or equivalent
    t.text("registration_body").nullable(); // e.g. MARA, OISC, ICCRC
    t.text("registration_status").nullable(); // active, suspended, expired
    t.date("registration_expiry").nullable();
    t.text("registration_level").nullable(); // e.g. OISC Level 1/2/3

    // Services
    t.specificType("visa_types_handled", "text[]").nullable(); // e.g. ["500","482","186","189"]
    t.jsonb("services_offered").nullable().defaultTo("[]"); // e.g. ["visa_lodgement","sponsorship","appeal","skills_assessment"]
    t.specificType("specializations", "text[]").nullable(); // e.g. ["student_visas","employer_sponsored","family_visas"]

    // Pricing
    t.decimal("fee_amount", null).nullable();
    t.text("fee_currency").nullable();
    t.text("fee_type").nullable(); // flat, hourly, per_application, from
    t.decimal("fee_from", null).nullable();
    t.decimal("fee_to", null).nullable();
    t.decimal("consultation_fee", null).nullable();
    t.boolean("consultation_free").nullable();
    t.text("payment_methods").nullable();

    // Track record
    t.decimal("success_rate", null).nullable();
    t.integer("cases_handled").nullable();
    t.integer("years_experience").nullable();
    t.integer("team_size").nullable();
    t.integer("qualified_agents_count").nullable();

    // Languages & coverage
    t.specificType("countries_serviced", "text[]").nullable();
    t.specificType("nationalities_serviced", "text[]").nullable();
    t.specificType("languages_spoken", "text[]").nullable();

    // Location
    t.text("address").nullable();
    t.text("street1").nullable();
    t.text("street2").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("country_code").nullable();
    t.text("postcode").nullable();

    // Contact
    t.text("contact_name").nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("contact_whatsapp").nullable();
    t.text("website").nullable();
    t.text("booking_url").nullable();

    // Operating
    t.text("operating_hours").nullable();
    t.boolean("appointment_required").nullable();
    t.boolean("online_consultations").nullable();

    // Reviews
    t.decimal("average_rating", null).nullable();
    t.integer("review_count").nullable();
    t.decimal("google_rating", null).nullable();
    t.text("rating_source").nullable();

    // Social
    t.text("facebook_url").nullable();
    t.text("linkedin_url").nullable();
    t.text("instagram_url").nullable();

    // Meta
    t.text("logo_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_visa_services_job_idx ON ${s}.extraction_visa_services (job_id)`);
  await knex.raw(`CREATE INDEX extraction_visa_services_status_idx ON ${s}.extraction_visa_services (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_visa_services");
}
