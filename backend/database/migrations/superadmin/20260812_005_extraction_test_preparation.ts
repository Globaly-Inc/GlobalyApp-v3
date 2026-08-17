// Migration: extraction_test_preparation table
// IELTS, TOEFL, PTE, OET, Cambridge, GMAT, GRE preparation courses

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_test_preparation", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("test_type").nullable(); // ielts, toefl, pte, cambridge, oet, gmat, gre, sat, duolingo
    t.text("test_variant").nullable(); // e.g. ielts_academic, ielts_general, toefl_ibt, toefl_pbt
    t.text("description").nullable();

    // Course details
    t.text("format").nullable(); // in_person, online, hybrid, self_study, private_tutoring
    t.integer("duration_hours").nullable();
    t.integer("duration_weeks").nullable();
    t.text("level").nullable(); // beginner, intermediate, advanced, all_levels
    t.text("target_score").nullable(); // e.g. "7.0", "100+", "65+"
    t.text("guaranteed_score").nullable(); // if they guarantee a minimum score
    t.boolean("score_guarantee_refund").nullable();

    // Content & modules
    t.jsonb("modules").nullable().defaultTo("[]"); // e.g. ["listening","reading","writing","speaking"]
    t.specificType("skills_covered", "text[]").nullable(); // e.g. ["grammar","vocabulary","essay_writing","time_management"]
    t.integer("practice_tests_count").nullable();
    t.integer("total_lessons").nullable();
    t.text("curriculum_overview").nullable();
    t.text("textbook").nullable();

    // Delivery
    t.integer("class_size_max").nullable();
    t.integer("class_size_avg").nullable();
    t.boolean("includes_mock_test").nullable();
    t.boolean("includes_materials").nullable();
    t.boolean("includes_marking").nullable();
    t.boolean("includes_feedback").nullable();
    t.boolean("includes_certificate").nullable();
    t.boolean("one_on_one_available").nullable();
    t.boolean("recorded_sessions").nullable();
    t.text("platform").nullable(); // e.g. zoom, google_meet, in_house

    // Schedule
    t.jsonb("schedule").nullable(); // e.g. {"days": ["Mon","Wed"], "time": "6pm-8pm"}
    t.specificType("start_dates", "text[]").nullable();
    t.boolean("flexible_start").nullable();
    t.text("intake_frequency").nullable(); // weekly, monthly, quarterly

    // Pricing
    t.decimal("fee_amount", null).nullable();
    t.text("fee_currency").nullable();
    t.text("fee_period").nullable(); // total, per_week, per_module, per_hour
    t.decimal("fee_per_hour", null).nullable();
    t.decimal("early_bird_discount", null).nullable();
    t.text("early_bird_conditions").nullable();
    t.jsonb("package_deals").nullable().defaultTo("[]"); // bundled offerings

    // Results & track record
    t.decimal("average_score_improvement", null).nullable();
    t.decimal("pass_rate", null).nullable();
    t.integer("students_trained").nullable();

    // Teachers
    t.text("teacher_qualifications").nullable();
    t.boolean("native_speakers").nullable();
    t.integer("teacher_count").nullable();

    // Location
    t.text("address").nullable();
    t.text("street1").nullable();
    t.text("street2").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("country_code").nullable();
    t.text("postcode").nullable();
    t.text("online_platform_url").nullable();

    // Contact
    t.text("contact_name").nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("contact_whatsapp").nullable();
    t.text("website").nullable();
    t.text("booking_url").nullable();
    t.text("free_trial_url").nullable();

    // Reviews
    t.decimal("average_rating", null).nullable();
    t.integer("review_count").nullable();
    t.decimal("google_rating", null).nullable();
    t.text("rating_source").nullable();

    // Meta
    t.text("logo_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_test_preparation_job_idx ON ${s}.extraction_test_preparation (job_id)`);
  await knex.raw(`CREATE INDEX extraction_test_preparation_status_idx ON ${s}.extraction_test_preparation (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_test_preparation");
}
