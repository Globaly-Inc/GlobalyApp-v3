// Per-tenant service catalog — child tables.
// Mirrors V1 public.service_* (which in turn mirror the proven superadmin
// extraction_* shapes). business_id columns from V1 are dropped: the schema is
// the business. Cross-schema refs (fee_types, degree_levels) are app-level FKs.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── service_fees — denormalised fee with installments jsonb (V1: 356) ──
  await knex.schema.createTable("service_fees", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.uuid("service_id").notNullable().references("id").inTable("business_services").onDelete("CASCADE");
    t.integer("fee_type_id").nullable(); // app-level FK to master fee_types.id
    t.text("name").nullable();
    t.text("student_type").notNullable().defaultTo("both");
    t.text("period_type").nullable().defaultTo("Per Year");
    t.text("currency").notNullable().defaultTo("AUD");
    t.decimal("total_amount", null).notNullable().defaultTo(0);
    t.jsonb("installments").notNullable().defaultTo("[]");
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["service_id"], "service_fees_service_id_idx");
  });

  // ── service_fee_structures (V1: 48) ──
  await knex.schema.createTable("service_fee_structures", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.uuid("service_id").notNullable().references("id").inTable("business_services").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("applicable_to").nullable();
    t.text("period").nullable();
    t.text("currency").nullable().defaultTo("AUD");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["service_id"], "service_fee_structures_service_id_idx");
  });

  // ── service_fee_installments (V1: 48) ──
  // V1 keeps the amounts in service_fee_items, which is empty (0 rows) — not
  // ported. Add it when the structured fee editor actually writes items.
  await knex.schema.createTable("service_fee_installments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.uuid("fee_structure_id").notNullable().references("id").inTable("service_fee_structures").onDelete("CASCADE");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["fee_structure_id"], "service_fee_installments_structure_idx");
  });

  // ── service_intakes (V1: 120) ──
  await knex.schema.createTable("service_intakes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.uuid("service_id").notNullable().references("id").inTable("business_services").onDelete("CASCADE");
    t.text("intake_name").nullable();
    t.date("start_date").nullable();
    t.date("end_date").nullable();
    t.date("orientation_date").nullable();
    t.date("admission_deadline").nullable();
    t.integer("intake_month").nullable();
    t.integer("intake_year").nullable();
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["service_id"], "service_intakes_service_id_idx");
  });

  // ── service_eligibility_requirements (V1: 342) ──
  await knex.schema.createTable("service_eligibility_requirements", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.uuid("service_id").nullable().references("id").inTable("business_services").onDelete("CASCADE");
    t.text("name").nullable();
    t.text("applicable_to").notNullable().defaultTo("both");
    t.text("min_degree_level").nullable();
    t.integer("degree_level_id").nullable(); // app-level FK to master degree_levels.id
    t.decimal("min_score_percent", null).nullable();
    t.text("min_score_grade").nullable();
    t.text("min_grading_system").nullable();
    t.jsonb("min_scores").notNullable().defaultTo("[]");
    t.text("description").nullable();
    t.jsonb("academic_tests").notNullable().defaultTo("[]");
    t.jsonb("language_tests").notNullable().defaultTo("[]");
    t.specificType("applicable_countries", "text[]").notNullable().defaultTo("{}");
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["service_id"], "service_eligibility_requirements_service_id_idx");
  });

  // ── service_study_options (V1: 18) ──
  await knex.schema.createTable("service_study_options", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.text("name").nullable();
    t.text("study_mode").notNullable()
      .checkIn(["on_campus", "online", "blended"], "service_study_options_study_mode_check");
    t.text("study_load").notNullable().defaultTo("full_time")
      .checkIn(["full_time", "part_time"], "service_study_options_study_load_check");
    t.integer("duration_value").nullable();
    t.text("duration_unit").nullable().defaultTo("months")
      .checkIn(["days", "weeks", "months", "years"], "service_study_options_duration_unit_check");
    t.text("applicable_to").notNullable().defaultTo("both")
      .checkIn(["international", "domestic", "both"], "service_study_options_applicable_to_check");
    t.boolean("save_for_reuse").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // ── service_study_units (V1: 17) ──
  await knex.schema.createTable("service_study_units", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique();
    t.text("unit_code").nullable();
    t.text("unit_name").notNullable();
    t.integer("credit_points").nullable();
    t.text("description").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "service_study_units",
    "service_study_options",
    "service_eligibility_requirements",
    "service_intakes",
    "service_fee_installments",
    "service_fee_structures",
    "service_fees",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
