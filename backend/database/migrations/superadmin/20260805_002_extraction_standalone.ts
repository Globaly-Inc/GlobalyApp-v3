// Migration 1/8: Standalone extraction tables (no FK dependencies on other extraction tables).
// Tables: extraction_jobs, extraction_accreditations, extraction_site_profiles, extraction_lessons

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";

  // pgvector — needed by extraction_memory.embedding and AI knowledge tables
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");

  // -- extraction_jobs --
  await knex.schema.withSchema(s).createTable("extraction_jobs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("institution_name").nullable();
    t.text("institution_url").notNullable();
    t.text("status").notNullable().defaultTo("pending");
    t.text("source_type").nullable().defaultTo("institution");
    t.text("aggregator_name").nullable();
    t.integer("total_pages_found").notNullable().defaultTo(0);
    t.integer("courses_extracted").notNullable().defaultTo(0);
    t.integer("verification_score").notNullable().defaultTo(0);
    t.integer("verification_total").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("business_category_id").unsigned().nullable();
    t.integer("service_category_id").unsigned().nullable();
    t.jsonb("guided_urls").nullable().defaultTo("{}");
    t.text("guidance_notes").nullable();
    t.jsonb("pipeline_progress").nullable().defaultTo("{}");
    t.integer("pages_scraped").nullable().defaultTo(0);
    t.integer("pages_failed").nullable().defaultTo(0);
    t.text("sample_course_url").nullable();
    t.jsonb("supporting_documents").nullable().defaultTo("[]");
    t.timestamp("processing_heartbeat_at", { useTz: true }).nullable();
    t.timestamp("last_progress_at", { useTz: true }).nullable();
    t.boolean("stop_requested").notNullable().defaultTo(false);
    t.jsonb("page_queue").notNullable().defaultTo("[]");
    t.integer("pages_total").notNullable().defaultTo(0);
    t.text("worker_id").nullable();
    t.integer("attempts").notNullable().defaultTo(0);
    t.integer("max_attempts").notNullable().defaultTo(3);
    t.jsonb("skipped_records").notNullable().defaultTo("[]");
    t.text("error_message").nullable();
  });

  await knex.raw(`
    CREATE INDEX idx_extraction_jobs_status_heartbeat
      ON superadmin.extraction_jobs (status, processing_heartbeat_at)
      WHERE status = ANY (ARRAY['pending','processing','stalled'])
  `);

  // -- extraction_accreditations --
  await knex.schema.withSchema(s).createTable("extraction_accreditations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("issuing_organization").nullable();
    t.text("website").nullable();
    t.text("description").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_site_profiles --
  await knex.schema.withSchema(s).createTable("extraction_site_profiles", (t) => {
    t.text("domain").primary();
    t.text("canonical_institution_name").nullable();
    t.text("canonical_legal_name").nullable();
    t.text("fee_format_hint").nullable();
    t.text("intake_format_hint").nullable();
    t.text("notes").nullable();
    t.jsonb("hints").notNullable().defaultTo("[]");
    t.decimal("success_rate", null).notNullable().defaultTo(0);
    t.integer("total_runs").notNullable().defaultTo(0);
    t.integer("total_corrections").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_lessons --
  await knex.schema.withSchema(s).createTable("extraction_lessons", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("scope").notNullable();
    t.text("domain").nullable();
    t.text("step").nullable();
    t.text("rule").notNullable();
    t.text("example_bad").nullable();
    t.text("example_good").nullable();
    t.text("source").notNullable().defaultTo("admin_manual");
    t.integer("weight").notNullable().defaultTo(1);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("scope = ANY (ARRAY['global','domain'])", [], "extraction_lessons_scope_check");
  });

  await knex.raw(`
    CREATE INDEX idx_extraction_lessons_domain_step
      ON superadmin.extraction_lessons (domain, step)
      WHERE is_active = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("extraction_lessons");
  await knex.schema.withSchema(s).dropTableIfExists("extraction_site_profiles");
  await knex.schema.withSchema(s).dropTableIfExists("extraction_accreditations");
  await knex.schema.withSchema(s).dropTableIfExists("extraction_jobs");
}
