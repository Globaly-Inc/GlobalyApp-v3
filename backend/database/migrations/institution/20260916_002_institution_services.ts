import type { Knex } from "knex";

// Institution twin of database/migrations/business/20260811_002_business_services.ts +
// 20260824_001_service_details_family.ts — same table names deliberately, so the existing
// business-services repository is reusable unmodified (see business-services.service.ts's
// "Institution twins" section).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_services", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("service_category_id").unsigned().nullable().references("id").inTable("service_categories");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.decimal("price").nullable();
    t.boolean("is_published").defaultTo(false);
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("schema_field_values", (t) => {
    t.increments("id").primary();
    t.uuid("entity_id").nullable();
    t.text("entity_type").notNullable();
    t.integer("schema_field_id").unsigned().notNullable().references("id").inTable("schema_fields").onDelete("CASCADE");
    t.jsonb("value").nullable();
    t.jsonb("meta").nullable();
    t.timestamps(true, true);
    t.unique(["entity_id", "entity_type", "schema_field_id"]);
  });

  await knex.schema.createTable("service_fees", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.text("name").nullable();
    t.text("student_type").notNullable().defaultTo("both");
    t.text("period_type").notNullable().defaultTo("Per Year");
    t.text("currency").notNullable().defaultTo("AUD");
    t.decimal("total_amount").notNullable().defaultTo(0);
    t.jsonb("installments").notNullable().defaultTo("[]");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("service_intakes", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.text("intake_name").nullable();
    t.date("start_date").nullable();
    t.date("end_date").nullable();
    t.date("orientation_date").nullable();
    t.date("admission_deadline").nullable();
    t.integer("intake_month").nullable();
    t.integer("intake_year").nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable("service_eligibility_requirements", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.text("name").nullable();
    t.text("applicable_to").notNullable().defaultTo("both");
    t.integer("degree_level_id").nullable();
    t.text("score_type").nullable();
    t.decimal("min_score").nullable();
    t.text("description").nullable();
    t.jsonb("academic_tests").notNullable().defaultTo("[]");
    t.jsonb("language_tests").notNullable().defaultTo("[]");
    t.timestamps(true, true);
    t.check(
      "score_type IS NULL OR score_type = ANY (ARRAY['percentage','gpa_4','gpa_10','cgpa'])",
      [],
      "service_eligibility_requirements_score_type_check",
    );
  });

  await knex.schema.createTable("service_study_options", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.text("name").nullable();
    t.text("study_mode").notNullable().defaultTo("on_campus");
    t.text("study_load").notNullable().defaultTo("full_time");
    t.integer("duration_value").nullable();
    t.text("duration_unit").notNullable().defaultTo("months");
    t.text("applicable_to").notNullable().defaultTo("both");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("service_study_units", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.text("unit_code").nullable();
    t.text("unit_name").notNullable();
    t.integer("credit_points").nullable();
    t.text("description").nullable();
    t.text("unit_type").notNullable().defaultTo("compulsory");
    t.timestamps(true, true);
    t.check("unit_type = ANY (ARRAY['compulsory','elective'])", [], "service_study_units_unit_type_check");
  });

  await knex.schema.createTable("service_accreditations", (t) => {
    t.increments("id").primary();
    t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
    t.integer("accreditation_id").unsigned().notNullable();
    t.timestamps(true, true);
    t.unique(["service_id", "accreditation_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_accreditations");
  await knex.schema.dropTableIfExists("service_study_units");
  await knex.schema.dropTableIfExists("service_study_options");
  await knex.schema.dropTableIfExists("service_eligibility_requirements");
  await knex.schema.dropTableIfExists("service_intakes");
  await knex.schema.dropTableIfExists("service_fees");
  await knex.schema.dropTableIfExists("schema_field_values");
  await knex.schema.dropTableIfExists("business_services");
}
