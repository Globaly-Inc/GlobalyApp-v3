// 20260925_003 added extraction_courses.is_published defaulting to false, meant only for
// self-service institution courses — but every other insert path (AgentCIS import, superadmin's
// manual course create) doesn't set the column, so their courses silently became hidden drafts.
// Default to published instead; the one path that wants a draft (institution-courses.repository's
// createService) already sets is_published: false explicitly.
// Rows already written as false by those paths are NOT flipped here: an owner's real draft looks
// identical, so fix any affected imported rows by job if needed.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE superadmin.extraction_courses ALTER COLUMN is_published SET DEFAULT true");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE superadmin.extraction_courses ALTER COLUMN is_published SET DEFAULT false");
}
