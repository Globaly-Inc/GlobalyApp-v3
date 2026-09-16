import type { Knex } from "knex";

// setAwardedBy (institution-courses.repository.ts) picked "awarded by" out of the general
// accreditation list by ordering — the earliest link — with no way to distinguish it from any
// other accreditation on the course. That made clearing it a no-op (nothing to un-order) and
// changing it additive (a new earliest link never displaces the old one on read, since "earliest"
// doesn't change). Give the pick its own flag so it can be set, moved and cleared explicitly.
const S = "superadmin";
const TABLE = "extraction_course_accreditation_assignments";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.boolean("is_awarded_by").notNullable().defaultTo(false);
  });
  // Backfill: reproduce the old read (earliest linked accreditation per course) as the flag, so
  // a course that already had an "Awarded by" pick doesn't silently lose it under the new read.
  await knex.raw(`
    UPDATE ${S}.${TABLE} eca SET is_awarded_by = true
    FROM (
      SELECT DISTINCT ON (course_id) id
      FROM ${S}.${TABLE}
      WHERE course_id IS NOT NULL AND accreditation_id IS NOT NULL
      ORDER BY course_id, created_at ASC
    ) earliest
    WHERE eca.id = earliest.id
  `);
  // At most one "awarded by" pick per course.
  await knex.raw(
    `CREATE UNIQUE INDEX idx_eca_awarded_by_per_course ON ${S}.${TABLE} (course_id) WHERE is_awarded_by`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_eca_awarded_by_per_course`);
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("is_awarded_by");
  });
}
