import type { Knex } from "knex";

// Cross-schema FKs from public (globalyapp) tables into superadmin extraction tables.
// They live here, not in the globalyapp migrations that create the columns, because
// of run order on a fresh database: globalyapp migrates first (superadmin's
// admin_users needs public.platform_users), so superadmin.extraction_* doesn't exist
// yet when representations/enquiries are created. This migration runs after both
// envs' tables exist. Constraint names match what knex's .references() would have
// generated, so databases migrated before this split carry identical constraints.
//
// The representations half is guarded: on a FRESH database the whole globalyapp chain runs
// before this env, and globalyapp 20260830_008 drops public.representations, so by the time
// this file runs the table is already gone and an unguarded ALTER fails the chain. Databases
// migrated before 08-30 ran this unguarded and then lost the constraints with the table, so
// both paths end in the same state. Edited in place (2026-09-17) rather than appended: knex
// never reaches a later migration while this one throws.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      IF to_regclass('public.representations') IS NOT NULL THEN
        ALTER TABLE public.representations
          ADD CONSTRAINT representations_extraction_job_id_foreign
            FOREIGN KEY (extraction_job_id) REFERENCES superadmin.extraction_jobs (id) ON DELETE CASCADE,
          ADD CONSTRAINT representations_extraction_course_id_foreign
            FOREIGN KEY (extraction_course_id) REFERENCES superadmin.extraction_courses (id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await knex.raw(`
    ALTER TABLE public.enquiries
      ADD CONSTRAINT enquiries_course_id_foreign
        FOREIGN KEY (course_id) REFERENCES superadmin.extraction_courses (id),
      ADD CONSTRAINT enquiries_extraction_job_id_foreign
        FOREIGN KEY (extraction_job_id) REFERENCES superadmin.extraction_jobs (id),
      ADD CONSTRAINT enquiries_institution_id_foreign
        FOREIGN KEY (institution_id) REFERENCES superadmin.extraction_institution_overview (id) ON DELETE SET NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE public.enquiries
      DROP CONSTRAINT IF EXISTS enquiries_course_id_foreign,
      DROP CONSTRAINT IF EXISTS enquiries_extraction_job_id_foreign,
      DROP CONSTRAINT IF EXISTS enquiries_institution_id_foreign
  `);
  await knex.raw(`
    DO $$ BEGIN
      IF to_regclass('public.representations') IS NOT NULL THEN
        ALTER TABLE public.representations
          DROP CONSTRAINT IF EXISTS representations_extraction_job_id_foreign,
          DROP CONSTRAINT IF EXISTS representations_extraction_course_id_foreign;
      END IF;
    END $$
  `);
}
