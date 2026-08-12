// Migration: extraction_translation table
// Document translation, interpreting, and NAATI services

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_translation", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // document_translation, interpreting, naati_certified, notarised, sworn, legal, medical, technical
    t.text("description").nullable();

    // Languages
    t.specificType("languages_from", "text[]").nullable();
    t.specificType("languages_to", "text[]").nullable();
    t.integer("language_pairs_count").nullable();
    t.specificType("specialization_languages", "text[]").nullable(); // languages they're strongest in

    // Documents & specialization
    t.specificType("document_types", "text[]").nullable(); // birth_certificate, academic_transcript, passport, drivers_licence, marriage_cert, police_check, medical_records, legal_contracts
    t.specificType("specializations", "text[]").nullable(); // legal, medical, technical, financial, academic, immigration, commercial

    // Certification
    t.text("certification").nullable(); // NAATI Certified, ATA Certified, sworn_translator
    t.text("certification_number").nullable();
    t.text("certification_body").nullable(); // NAATI, ATA, ITI, CIOL
    t.text("certification_level").nullable(); // e.g. NAATI Certified, NAATI Recognised, NAATI Certified Specialist
    t.boolean("is_sworn_translator").nullable();
    t.boolean("court_approved").nullable();

    // Pricing
    t.decimal("fee_amount", null).nullable();
    t.text("fee_currency").nullable();
    t.text("fee_type").nullable(); // per_page, per_word, per_document, per_hour, flat
    t.decimal("fee_per_page", null).nullable();
    t.decimal("fee_per_word", null).nullable();
    t.decimal("minimum_charge", null).nullable();
    t.decimal("rush_fee_multiplier", null).nullable();
    t.decimal("notarisation_fee", null).nullable();

    // Delivery
    t.text("turnaround_time").nullable(); // e.g. "2-3 business days"
    t.boolean("express_available").nullable();
    t.text("express_turnaround").nullable(); // e.g. "24 hours", "same day"
    t.text("delivery_format").nullable(); // digital, hard_copy, both, certified_hard_copy
    t.boolean("accepts_online_orders").nullable();
    t.boolean("mail_delivery").nullable();
    t.boolean("pickup_available").nullable();

    // Quality
    t.text("quality_assurance").nullable();
    t.boolean("revision_included").nullable();
    t.integer("revision_count").nullable();
    t.boolean("proofreading_included").nullable();
    t.integer("words_per_day_capacity").nullable();

    // Location
    t.text("address").nullable();
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
    t.text("order_url").nullable();
    t.text("quote_url").nullable();

    // Operating
    t.text("operating_hours").nullable();

    // Reviews
    t.decimal("average_rating", null).nullable();
    t.integer("review_count").nullable();
    t.decimal("google_rating", null).nullable();
    t.text("rating_source").nullable();
    t.integer("documents_translated").nullable(); // total docs handled

    // Meta
    t.text("logo_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_translation_job_idx ON ${s}.extraction_translation (job_id)`);
  await knex.raw(`CREATE INDEX extraction_translation_status_idx ON ${s}.extraction_translation (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_translation");
}
