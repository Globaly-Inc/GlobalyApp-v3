import type { Knex } from "knex";

// stageCourseAccreditation is now called by concurrent page workers (the automatic pipeline stages
// accreditations since 2026-10-12), and its find-then-insert had no constraint to stop two workers
// both inserting the same body. Expression index, so "CIM" and "cim" are one row.
// Not every database's rows are already distinct under lower(trim(name)) (a dev DB with older
// extractions failed the index), so duplicates are merged first: the oldest row per name is kept,
// fills its empty columns from the others, and inherits their course assignments.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TEMP TABLE acc_dupes ON COMMIT DROP AS
    SELECT id, keep_id FROM (
      SELECT id, FIRST_VALUE(id) OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY created_at, id) AS keep_id
      FROM superadmin.extraction_accreditations
    ) r
    WHERE id <> keep_id
  `);

  await knex.raw(`
    UPDATE superadmin.extraction_accreditations k SET
      issuing_organization = COALESCE(k.issuing_organization, x.issuing_organization),
      website = COALESCE(k.website, x.website),
      description = COALESCE(k.description, x.description)
    FROM (
      SELECT d.keep_id, MAX(a.issuing_organization) AS issuing_organization, MAX(a.website) AS website, MAX(a.description) AS description
      FROM acc_dupes d JOIN superadmin.extraction_accreditations a ON a.id = d.id
      GROUP BY d.keep_id
    ) x
    WHERE k.id = x.keep_id
  `);

  // A course linked to two spellings of one body would collide on (course_id, extraction_accreditation_id)
  // once both point at the keeper — keep one link per course, preferring the keeper's own.
  await knex.raw(`
    DELETE FROM superadmin.extraction_course_accreditation_assignments
    WHERE id IN (
      SELECT id FROM (
        SELECT ca.id, ROW_NUMBER() OVER (
          PARTITION BY ca.course_id, COALESCE(d.keep_id, ca.extraction_accreditation_id)
          ORDER BY (d.id IS NULL) DESC, ca.id
        ) AS rn
        FROM superadmin.extraction_course_accreditation_assignments ca
        LEFT JOIN acc_dupes d ON d.id = ca.extraction_accreditation_id
        WHERE ca.course_id IS NOT NULL
          AND (d.id IS NOT NULL OR ca.extraction_accreditation_id IN (SELECT keep_id FROM acc_dupes))
      ) r
      WHERE rn > 1
    )
  `);

  await knex.raw(`
    UPDATE superadmin.extraction_course_accreditation_assignments ca
    SET extraction_accreditation_id = d.keep_id
    FROM acc_dupes d
    WHERE ca.extraction_accreditation_id = d.id
  `);

  await knex.raw(`DELETE FROM superadmin.extraction_accreditations WHERE id IN (SELECT id FROM acc_dupes)`);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS extraction_accreditations_name_uniq
    ON superadmin.extraction_accreditations ((LOWER(TRIM(name))))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // The merge isn't reversible — only the index comes off.
  await knex.raw("DROP INDEX IF EXISTS superadmin.extraction_accreditations_name_uniq");
}
