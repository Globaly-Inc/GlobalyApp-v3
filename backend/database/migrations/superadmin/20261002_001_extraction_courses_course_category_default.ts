// Intentionally a no-op now. Its first version backfilled NULL course_category to 'academic' and
// set that as the column default — but that turned "unclassified" into "academic", so a later
// extraction that correctly says short_course could never fill it in (the merge only fills empty
// fields). "No category = academic" is applied when READING instead (courses.repository's
// category filter; the portal already labels NULL "Academic Course").
// Kept, not deleted: knex refuses to run anything when a recorded migration's file is missing. A
// database that ran the first version keeps its backfilled rows — harmless, they read the same.

import type { Knex } from "knex";

export async function up(_knex: Knex): Promise<void> {}

export async function down(knex: Knex): Promise<void> {
  // Undo the first version's column default where it ran (a no-op elsewhere).
  await knex.raw("ALTER TABLE superadmin.extraction_courses ALTER COLUMN course_category DROP DEFAULT");
}
