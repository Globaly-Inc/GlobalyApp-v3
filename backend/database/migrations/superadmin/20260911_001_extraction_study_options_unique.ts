import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_study_options";
const ASSIGNMENTS = "extraction_course_study_option_assignments";

// upsertStudyOption's identity is (job_id, study_mode, study_load, duration_value, duration_unit),
// but check-then-insert races when two page workers write the identical option concurrently — no
// DB constraint backed it, so a second row was created instead of shared (review finding,
// 2026-09-11). All four can be null (an admin-created row skips upsertStudyOption's own
// defaulting), and Postgres never treats NULL as equal to NULL in a plain UNIQUE constraint, so
// the index is on a COALESCE-normalized expression instead of the raw columns — matching how
// scripts/backfill-study-option-dedup.ts already groups duplicates.
const KEY = "job_id, COALESCE(study_mode, ''), COALESCE(study_load, ''), COALESCE(duration_value, -1), COALESCE(duration_unit, '')";

export async function up(knex: Knex): Promise<void> {
  // Dedupe existing rows first: keep the earliest-created row per tuple, fill its blank name
  // from a copy, repoint every course's assignment onto it, then drop the copies. Same order as
  // the standalone backfill script — repoint before delete, since a copy's assignments cascade
  // away with it.
  await knex.raw(`
    CREATE TEMP TABLE study_option_dupes ON COMMIT DROP AS
    SELECT id, job_id,
           ROW_NUMBER() OVER (PARTITION BY ${KEY} ORDER BY created_at ASC) AS rn,
           FIRST_VALUE(id) OVER (PARTITION BY ${KEY} ORDER BY created_at ASC) AS survivor_id
    FROM ${S}.${TABLE}
  `);

  await knex.raw(`
    UPDATE ${S}.${TABLE} o
    SET name = dup.name
    FROM study_option_dupes d, ${S}.${TABLE} dup
    WHERE d.rn > 1 AND dup.id = d.id AND dup.name IS NOT NULL
      AND o.id = d.survivor_id AND o.name IS NULL
  `);

  // An assignment that would collide with one the survivor already has can't be repointed —
  // drop it instead of violating the junction's own unique(course_id, study_option_id).
  await knex.raw(`
    DELETE FROM ${S}.${ASSIGNMENTS} a
    USING study_option_dupes d
    WHERE a.study_option_id = d.id AND d.rn > 1
      AND EXISTS (
        SELECT 1 FROM ${S}.${ASSIGNMENTS} a2
        WHERE a2.course_id = a.course_id AND a2.study_option_id = d.survivor_id
      )
  `);

  await knex.raw(`
    UPDATE ${S}.${ASSIGNMENTS} a
    SET study_option_id = d.survivor_id
    FROM study_option_dupes d
    WHERE a.study_option_id = d.id AND d.rn > 1
  `);

  await knex.raw(`
    DELETE FROM ${S}.${TABLE} o
    USING study_option_dupes d
    WHERE o.id = d.id AND d.rn > 1
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX extraction_study_options_dedup_uniq ON ${S}.${TABLE} (${KEY})
  `);
}

export async function down(knex: Knex): Promise<void> {
  // The dedupe is not reversible; this only removes the constraint.
  await knex.raw(`DROP INDEX ${S}.extraction_study_options_dedup_uniq`);
}
