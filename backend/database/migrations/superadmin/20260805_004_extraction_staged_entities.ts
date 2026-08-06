// Migration 3/8: Staged entities that FK to extraction_jobs (and optionally extraction_courses).
// Tables: extraction_intakes, extraction_course_fees, extraction_eligibility_requirements,
//         extraction_english_requirements, extraction_study_options, extraction_study_units,
//         extraction_verification_results, extraction_agent_locations

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;
  const coursesRef = `${s}.extraction_courses`;
  const agentsRef = `${s}.extraction_agents`;

  // -- extraction_intakes --
  await knex.schema.withSchema(s).createTable("extraction_intakes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("SET NULL");
    t.text("intake_name").nullable();
    t.date("start_date").nullable();
    t.date("end_date").nullable();
    t.date("orientation_date").nullable();
    t.date("admission_deadline").nullable();
    t.integer("intake_month").nullable();
    t.integer("intake_year").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_extraction_intakes_job_id ON ${s}.extraction_intakes (job_id)`);

  // -- extraction_course_fees --
  await knex.schema.withSchema(s).createTable("extraction_course_fees", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").nullable();
    t.text("student_type").notNullable().defaultTo("both");
    t.text("period_type").nullable().defaultTo("Per Year");
    t.text("currency").notNullable().defaultTo("AUD");
    t.decimal("total_amount", null).notNullable().defaultTo(0);
    t.jsonb("installments").notNullable().defaultTo("[]");
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid("fee_type_id").nullable(); // FK target: public.fee_types(id), add when table exists
  });
  await knex.raw(`CREATE INDEX idx_extraction_course_fees_job_id ON ${s}.extraction_course_fees (job_id)`);

  // -- extraction_eligibility_requirements --
  await knex.schema.withSchema(s).createTable("extraction_eligibility_requirements", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("name").nullable();
    t.text("applicable_to").notNullable().defaultTo("both");
    t.text("min_degree_level").nullable();
    t.decimal("min_score_percent", null).nullable();
    t.text("min_score_grade").nullable();
    t.text("description").nullable();
    t.jsonb("academic_tests").notNullable().defaultTo("[]");
    t.jsonb("language_tests").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("score_type").nullable();
    t.decimal("min_score", null).nullable();
    t.uuid("degree_level_id").nullable(); // FK target: public.degree_levels(id), add when table exists
    t.check(
      "score_type IS NULL OR score_type = ANY (ARRAY['percentage','gpa_4','gpa_10','cgpa'])",
      [],
      "extraction_eligibility_requirements_score_type_check",
    );
  });
  await knex.raw(`CREATE INDEX idx_extraction_eligibility_requirements_job_id ON ${s}.extraction_eligibility_requirements (job_id)`);

  // -- extraction_english_requirements --
  await knex.schema.withSchema(s).createTable("extraction_english_requirements", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.text("test_type_name").nullable();
    t.integer("test_type").nullable();
    t.text("overall_score").nullable();
    t.text("listening_score").nullable();
    t.text("reading_score").nullable();
    t.text("writing_score").nullable();
    t.text("speaking_score").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_study_options --
  await knex.schema.withSchema(s).createTable("extraction_study_options", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("study_mode").notNullable().defaultTo("on_campus");
    t.text("study_load").notNullable().defaultTo("full_time");
    t.integer("duration_value").nullable();
    t.text("duration_unit").nullable().defaultTo("months");
    t.text("applicable_to").notNullable().defaultTo("both");
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("name").nullable();
  });
  await knex.raw(`CREATE INDEX idx_extraction_study_options_job ON ${s}.extraction_study_options (job_id)`);

  // -- extraction_study_units --
  await knex.schema.withSchema(s).createTable("extraction_study_units", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("unit_code").nullable();
    t.text("unit_name").notNullable();
    t.integer("credit_points").nullable();
    t.text("description").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("unit_type").notNullable().defaultTo("compulsory");
    t.check(
      "unit_type = ANY (ARRAY['compulsory','elective'])",
      [],
      "extraction_study_units_unit_type_check",
    );
  });

  // -- extraction_verification_results --
  await knex.schema.withSchema(s).createTable("extraction_verification_results", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.text("field_name").notNullable();
    t.text("extracted_value").notNullable();
    t.text("live_value").nullable();
    t.text("status").notNullable().defaultTo("not_found");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_agent_locations --
  await knex.schema.withSchema(s).createTable("extraction_agent_locations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("agent_id").notNullable().references("id").inTable(agentsRef).onDelete("CASCADE");
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.boolean("is_head_office").notNullable().defaultTo(false);
    t.text("street1").nullable();
    t.text("street2").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("postcode").nullable();
    t.text("address").nullable();
    t.text("email").nullable();
    t.text("phone").nullable();
    t.text("website").nullable();
    t.text("external_id").nullable();
    t.text("source_url").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_agent_locations_agent_id_idx ON ${s}.extraction_agent_locations (agent_id)`);
  await knex.raw(`CREATE INDEX extraction_agent_locations_job_id_idx ON ${s}.extraction_agent_locations (job_id)`);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  const tables = [
    "extraction_agent_locations",
    "extraction_verification_results",
    "extraction_study_units",
    "extraction_study_options",
    "extraction_english_requirements",
    "extraction_eligibility_requirements",
    "extraction_course_fees",
    "extraction_intakes",
  ];
  for (const table of tables) {
    await knex.schema.withSchema(s).dropTableIfExists(table);
  }
}
