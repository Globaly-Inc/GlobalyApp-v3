// Per-tenant service catalog — junction tables (service ↔ reusable child entity).
// Shapes follow superadmin extraction_course_*_assignments.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const junction = (
    table: string,
    otherColumn: string,
    otherTable: string | null,
    extra?: (t: Knex.CreateTableBuilder) => void,
  ) =>
    knex.schema.createTable(table, (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("v1_id").nullable().unique();
      t.uuid("service_id").notNullable().references("id").inTable("business_services").onDelete("CASCADE");
      if (otherTable) {
        t.uuid(otherColumn).notNullable().references("id").inTable(otherTable).onDelete("CASCADE");
      } else {
        t.integer(otherColumn).notNullable(); // app-level FK to a master-schema table
      }
      extra?.(t);
      t.timestamps(true, true);
      t.timestamp("deleted_at").nullable();
      t.unique(["service_id", otherColumn], { indexName: `${table}_pair_unique` });
      t.index([otherColumn], `${table}_target_idx`);
    });

  await junction("service_fee_assignments", "service_fee_id", "service_fees"); // V1: 5
  await junction("service_intake_assignments", "intake_id", "service_intakes"); // V1: none (intakes hang off service_id directly)
  await junction("service_eligibility_assignments", "eligibility_requirement_id", "service_eligibility_requirements"); // V1: 7
  await junction("service_study_option_assignments", "study_option_id", "service_study_options"); // V1: 28
  await junction("service_study_unit_assignments", "study_unit_id", "service_study_units", (t) => {
    t.text("unit_type").notNullable().defaultTo("compulsory")
      .checkIn(["compulsory", "elective"], "service_study_unit_assignments_unit_type_check");
  }); // V1: 21
  // accreditation_id targets the master schema (public.accreditations.id, integer)
  await junction("service_accreditation_assignments", "accreditation_id", null, (t) => {
    t.text("registration_number").nullable();
  }); // V1: 6
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "service_accreditation_assignments",
    "service_study_unit_assignments",
    "service_study_option_assignments",
    "service_eligibility_assignments",
    "service_intake_assignments",
    "service_fee_assignments",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
