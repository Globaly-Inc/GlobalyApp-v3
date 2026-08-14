// Migration: extraction_career_services table
// Resume writing, job placement, internships, career coaching

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_career_services", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // resume_writing, job_placement, internship, career_coaching, interview_prep, mentoring, skills_assessment, recruitment, volunteer
    t.text("description").nullable();

    // Service details
    t.jsonb("services_offered").nullable().defaultTo("[]"); // granular: ["resume_review","cover_letter","linkedin_optimization","portfolio","mock_interview"]
    t.specificType("industries", "text[]").nullable();
    t.specificType("job_types", "text[]").nullable(); // full_time, part_time, casual, contract, internship, volunteer

    // Pricing
    t.decimal("fee_amount", null).nullable();
    t.text("fee_currency").nullable();
    t.text("fee_type").nullable(); // flat, hourly, per_session, free, subscription, commission
    t.decimal("fee_from", null).nullable();
    t.decimal("fee_to", null).nullable();
    t.boolean("free_initial_consultation").nullable();
    t.boolean("free_services_available").nullable();
    t.text("free_services_details").nullable();

    // Delivery
    t.text("duration").nullable(); // e.g. "1 session", "4 weeks", "ongoing", "3 months"
    t.integer("sessions_included").nullable();
    t.text("session_duration").nullable(); // e.g. "30 min", "1 hour"
    t.text("delivery_mode").nullable(); // in_person, online, hybrid
    t.text("platform").nullable(); // zoom, teams, in_house

    // Inclusions
    t.jsonb("inclusions").nullable().defaultTo("[]");
    t.boolean("resume_review").nullable();
    t.boolean("cover_letter").nullable();
    t.boolean("linkedin_optimization").nullable();
    t.boolean("portfolio_review").nullable();
    t.boolean("interview_coaching").nullable();
    t.boolean("salary_negotiation").nullable();
    t.boolean("skills_assessment").nullable();
    t.boolean("job_search_support").nullable();
    t.boolean("networking_events").nullable();
    t.integer("revisions_included").nullable();
    t.text("turnaround_time").nullable(); // e.g. "3 business days"

    // Placement track record
    t.decimal("placement_rate", null).nullable();
    t.decimal("average_salary", null).nullable();
    t.text("average_salary_currency").nullable();
    t.integer("employer_partnerships_count").nullable();
    t.jsonb("partner_companies").nullable().defaultTo("[]");
    t.integer("candidates_placed").nullable();
    t.text("average_placement_time").nullable(); // e.g. "4-6 weeks"

    // Eligibility
    t.text("eligibility").nullable();
    t.specificType("visa_types_eligible", "text[]").nullable();
    t.text("qualification_level").nullable();
    t.specificType("target_audience", "text[]").nullable(); // students, graduates, professionals, career_changers

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
    t.text("booking_url").nullable();
    t.text("apply_url").nullable();

    // Operating
    t.text("operating_hours").nullable();
    t.boolean("appointment_required").nullable();

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
  await knex.raw(`CREATE INDEX extraction_career_services_job_idx ON ${s}.extraction_career_services (job_id)`);
  await knex.raw(`CREATE INDEX extraction_career_services_status_idx ON ${s}.extraction_career_services (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_career_services");
}
