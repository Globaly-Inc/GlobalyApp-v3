import type { Knex } from "knex";

// stageCourseAccreditation is now called by concurrent page workers (the automatic pipeline stages
// accreditations since 2026-10-12), and its find-then-insert had no constraint to stop two workers
// both inserting the same body. Expression index, so "CIM" and "cim" are one row.
// Verified before writing: the table's existing rows are already distinct under lower(trim(name)).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS extraction_accreditations_name_uniq
    ON superadmin.extraction_accreditations ((LOWER(TRIM(name))))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS superadmin.extraction_accreditations_name_uniq");
}
