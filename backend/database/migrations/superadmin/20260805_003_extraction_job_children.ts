// Migration 2/8: Direct children of extraction_jobs (no FK to other extraction tables).
// Tables: extraction_job_events, extraction_queue, extraction_institution_overview,
//         extraction_site_intelligence, extraction_campuses, extraction_courses,
//         extraction_agents, extraction_additional_info, extraction_memory

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  // -- extraction_job_events --
  await knex.schema.withSchema(s).createTable("extraction_job_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("kind").notNullable();
    t.text("level").notNullable().defaultTo("info");
    t.text("phase").nullable();
    t.text("message").nullable();
    t.jsonb("data").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    CREATE INDEX idx_extraction_job_events_job_created
      ON ${s}.extraction_job_events (job_id, created_at DESC)
  `);

  // -- extraction_queue --
  await knex.schema.withSchema(s).createTable("extraction_queue", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("url").notNullable();
    t.text("status").notNullable().defaultTo("pending");
    t.text("error").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.jsonb("extracted_data").nullable();
    t.integer("retry_count").notNullable().defaultTo(0);
    t.text("failure_class").nullable();
    t.jsonb("processing_meta").notNullable().defaultTo("{}");
    t.text("kind").notNullable().defaultTo("institution");
  });
  await knex.raw(`CREATE INDEX extraction_queue_kind_idx ON ${s}.extraction_queue (kind)`);
  await knex.raw(`CREATE INDEX idx_extraction_queue_job_status ON ${s}.extraction_queue (job_id, status)`);

  // -- extraction_institution_overview --
  await knex.schema.withSchema(s).createTable("extraction_institution_overview", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").nullable();
    t.text("website").nullable();
    t.text("phone").nullable();
    t.text("email").nullable();
    t.text("address").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("description").nullable();
    t.text("logo_url").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("zip_code").nullable();
    t.text("facebook_url").nullable();
    t.text("instagram_url").nullable();
    t.text("twitter_url").nullable();
    t.text("linkedin_url").nullable();
    t.text("youtube_url").nullable();
  });

  // -- extraction_site_intelligence --
  await knex.schema.withSchema(s).createTable("extraction_site_intelligence", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("institution_name").nullable();
    t.text("institution_type").nullable();
    t.text("country").nullable();
    t.text("currency").nullable();
    t.jsonb("fee_structure").nullable().defaultTo("{}");
    t.specificType("extraction_hints", "text[]").nullable();
    t.jsonb("navigation_patterns").nullable().defaultTo("{}");
    t.jsonb("raw_analysis").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_campuses --
  await knex.schema.withSchema(s).createTable("extraction_campuses", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").nullable();
    t.text("address").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("phone").nullable();
    t.text("email").nullable();
    t.text("map_link").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("postcode").nullable();
  });

  // -- extraction_courses --
  await knex.schema.withSchema(s).createTable("extraction_courses", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("short_name").nullable();
    t.text("degree_level").nullable();
    t.text("degree_level_code").nullable();
    t.text("subject_area").nullable();
    t.text("subject_area_code").nullable();
    t.integer("duration_weeks").nullable();
    t.text("study_mode").nullable();
    t.text("description").nullable();
    t.decimal("domestic_fee_total", null).nullable();
    t.text("domestic_fee_installments").nullable();
    t.text("domestic_fee_heading").nullable();
    t.text("domestic_currency").nullable();
    t.text("domestic_eligibility").nullable();
    t.decimal("international_fee_total", null).nullable();
    t.text("international_fee_installments").nullable();
    t.text("international_currency").nullable();
    t.text("international_eligibility").nullable();
    t.text("awarding_institution").nullable();
    t.text("brochure_url").nullable();
    t.text("image_url").nullable();
    t.specificType("career_paths", "text[]").nullable();
    t.text("country_code").nullable();
    t.integer("course_status").nullable();
    t.text("source_url").nullable();
    t.text("verification_status").nullable().defaultTo("unverified");
    t.timestamp("last_verified_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_extraction_courses_job_id ON ${s}.extraction_courses (job_id)`);

  // -- extraction_agents --
  await knex.schema.withSchema(s).createTable("extraction_agents", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").nullable();
    t.text("country").nullable();
    t.text("email").nullable();
    t.text("phone").nullable();
    t.text("website").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("page_number").nullable();
    t.text("source_status").nullable().defaultTo("active");
    t.text("street1").nullable();
    t.text("street2").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("postcode").nullable();
    t.text("address").nullable();
    t.text("external_id").nullable();
    t.integer("location_count").notNullable().defaultTo(1);
    t.text("logo_url").nullable();
    t.text("logo_storage_path").nullable();
    t.text("logo_source_url").nullable();
    t.text("website_source").nullable();
    t.unique(["job_id", "external_id"], { indexName: "extraction_agents_job_external_uniq" });
  });

  // -- extraction_additional_info --
  await knex.schema.withSchema(s).createTable("extraction_additional_info", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("key").notNullable();
    t.text("value").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_memory --
  // ponytail: skipping pgvector embedding column — add when LLM memory search is implemented
  await knex.schema.withSchema(s).createTable("extraction_memory", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").nullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("domain").notNullable();
    t.text("step").notNullable();
    t.text("entity_type").notNullable();
    t.text("entity_ref").nullable();
    t.text("source_url").nullable();
    t.text("source_excerpt").nullable();
    t.jsonb("ai_output").notNullable();
    t.jsonb("final_output").nullable();
    t.jsonb("diff").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("corrected_at", { useTz: true }).nullable();
  });
  await knex.raw(`
    CREATE INDEX idx_extraction_memory_corrected
      ON ${s}.extraction_memory (corrected_at)
      WHERE corrected_at IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_extraction_memory_domain_step
      ON ${s}.extraction_memory (domain, step)
  `);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  const tables = [
    "extraction_memory",
    "extraction_additional_info",
    "extraction_agents",
    "extraction_courses",
    "extraction_campuses",
    "extraction_site_intelligence",
    "extraction_institution_overview",
    "extraction_queue",
    "extraction_job_events",
  ];
  for (const table of tables) {
    await knex.schema.withSchema(s).dropTableIfExists(table);
  }
}
