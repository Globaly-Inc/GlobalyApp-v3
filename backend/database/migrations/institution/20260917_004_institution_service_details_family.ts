import type { Knex } from "knex";

// Backfill for institutions whose schema was provisioned while 20260916_002_institution_services.ts
// was mid-edit this session: Knex's migration ledger tracks filenames, not content, so once that
// filename ran once (before service_fees/intakes/eligibility/etc. existed in it), later edits to
// the same file never took effect for already-provisioned tenants even after re-running
// `migrate:tenants`. `hasTable` guards make this a no-op for tenants that already have them
// (freshly provisioned after the file settled) and a real backfill for the rest.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("service_fees"))) {
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
  }

  if (!(await knex.schema.hasTable("service_intakes"))) {
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
  }

  if (!(await knex.schema.hasTable("service_eligibility_requirements"))) {
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
  }

  if (!(await knex.schema.hasTable("service_study_options"))) {
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
  }

  if (!(await knex.schema.hasTable("service_study_units"))) {
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
  }

  if (!(await knex.schema.hasTable("service_accreditations"))) {
    await knex.schema.createTable("service_accreditations", (t) => {
      t.increments("id").primary();
      t.uuid("service_id").notNullable().references("uuid").inTable("business_services").onDelete("CASCADE");
      t.integer("accreditation_id").unsigned().notNullable();
      t.timestamps(true, true);
      t.unique(["service_id", "accreditation_id"]);
    });
  }
}

// Intentionally a no-op: up() only creates a table when it's missing (i.e. only on tenants where
// 20260916_002_institution_services.ts ran before these tables existed in its content), and
// 002's own down() already drops all six tables. Dropping them here too would mean rolling back
// just this migration destroys tables — and data — that 002 considers itself the owner of on
// every tenant that already has them, rather than only undoing what this migration itself added.
export async function down(_knex: Knex): Promise<void> {}
