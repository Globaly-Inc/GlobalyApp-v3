// Migration 5/8: Immigration tables (visas, MARA agents) + agent extraction runs/schedule.
// Tables: extraction_visas, extraction_mara_agents, agent_extraction_runs, agent_extraction_schedule

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  // -- PG enum for agent_extraction_cadence --
  await knex.raw(`
    CREATE TYPE superadmin.agent_extraction_cadence AS ENUM ('daily', 'weekly', 'monthly')
  `);

  // -- extraction_visas --
  // Note: job_id has no FK in V2 either — kept as plain uuid for parity
  await knex.schema.withSchema(s).createTable("extraction_visas", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").nullable();
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable(); // FK target: public.business_services(id), add when table exists
    t.text("country_code").notNullable();
    t.text("subclass_code").notNullable();
    t.text("visa_stream").nullable();
    t.text("category").nullable();
    t.text("name").nullable();
    t.text("description").nullable();
    t.integer("duration_months").nullable();
    t.boolean("is_permanent").nullable();
    t.jsonb("work_rights").nullable();
    t.jsonb("study_rights").nullable();
    t.boolean("points_test_required").nullable();
    t.integer("min_points").nullable();
    t.jsonb("english_requirements").nullable();
    t.integer("age_min").nullable();
    t.integer("age_max").nullable();
    t.specificType("eligible_nationalities", "text[]").nullable();
    t.specificType("excluded_nationalities", "text[]").nullable();
    t.decimal("application_fee_amount", null).nullable();
    t.text("application_fee_currency").nullable();
    t.integer("processing_time_min_days").nullable();
    t.integer("processing_time_max_days").nullable();
    t.text("official_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_visas_job_idx ON ${s}.extraction_visas (job_id)`);
  await knex.raw(`CREATE INDEX extraction_visas_status_idx ON ${s}.extraction_visas (status)`);
  // Natural key — matches V2: one row per visa subclass + stream combo
  await knex.raw(`
    CREATE UNIQUE INDEX extraction_visas_natural_key
      ON ${s}.extraction_visas (country_code, subclass_code, COALESCE(visa_stream, ''))
  `);

  // -- extraction_mara_agents --
  // Note: job_id has no FK in V2 either — kept as plain uuid for parity
  await knex.schema.withSchema(s).createTable("extraction_mara_agents", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").nullable();
    t.text("status").notNullable().defaultTo("pending");
    t.integer("promoted_business_id").unsigned().nullable().references("id").inTable("public.businesses").onDelete("SET NULL");
    t.text("marn").notNullable().unique();
    t.text("agent_name").nullable();
    t.text("business_name").nullable();
    t.text("registration_status").nullable();
    t.date("registration_date").nullable();
    t.date("expiry_date").nullable();
    t.text("email").nullable();
    t.text("phone").nullable();
    t.text("website").nullable();
    t.specificType("practice_areas", "text[]").nullable();
    t.specificType("languages_spoken", "text[]").nullable();
    t.text("office_country").nullable();
    t.text("office_state").nullable();
    t.text("office_city").nullable();
    t.text("office_address").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_mara_agents_job_idx ON ${s}.extraction_mara_agents (job_id)`);
  await knex.raw(`CREATE INDEX extraction_mara_agents_marn_idx ON ${s}.extraction_mara_agents (marn)`);
  await knex.raw(`CREATE INDEX extraction_mara_agents_status_idx ON ${s}.extraction_mara_agents (status)`);

  // -- agent_extraction_runs --
  await knex.schema.withSchema(s).createTable("agent_extraction_runs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("finished_at", { useTz: true }).nullable();
    t.text("status").notNullable().defaultTo("running");
    t.text("provider").nullable();
    t.integer("agents_found").notNullable().defaultTo(0);
    t.integer("agents_new").notNullable().defaultTo(0);
    t.integer("agents_updated").notNullable().defaultTo(0);
    t.integer("agents_removed").notNullable().defaultTo(0);
    t.text("error_message").nullable();
    t.jsonb("meta").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_agent_extraction_runs_job ON ${s}.agent_extraction_runs (job_id, started_at DESC)`);

  // -- agent_extraction_schedule --
  await knex.schema.withSchema(s).createTable("agent_extraction_schedule", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().unique().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.specificType("cadence", "superadmin.agent_extraction_cadence").notNullable();
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("next_run_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_run_at", { useTz: true }).nullable();
    t.text("last_status").nullable();
    t.text("last_error").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    CREATE INDEX agent_extraction_schedule_due_idx
      ON ${s}.agent_extraction_schedule (next_run_at)
      WHERE enabled = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("agent_extraction_schedule");
  await knex.schema.withSchema(s).dropTableIfExists("agent_extraction_runs");
  await knex.schema.withSchema(s).dropTableIfExists("extraction_mara_agents");
  await knex.schema.withSchema(s).dropTableIfExists("extraction_visas");
  await knex.raw(`DROP TYPE IF EXISTS ${s}.agent_extraction_cadence`);
}
