// Drops the 'academic' column default that 20261002_001's first version set on databases that ran
// it (see that file). Idempotent — DROP DEFAULT on a column without one is a no-op.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE superadmin.extraction_courses ALTER COLUMN course_category DROP DEFAULT");
}

export async function down(): Promise<void> {}
