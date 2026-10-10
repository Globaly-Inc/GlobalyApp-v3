// extraction_site_intelligence is one row per job (writeSiteIntelligence upserts on job_id via
// .onConflict("job_id")), but the table's creating migration (20260805_003) never declared that
// constraint — only a plain FK on job_id. Postgres refuses ON CONFLICT (job_id) without a
// matching unique index/constraint, so every site_analysis write failed with "there is no unique
// or exclusion constraint matching the ON CONFLICT specification" on a database that only has
// what the migrations declare (Greptile). IF NOT EXISTS: a dev database that already carries
// this index under the same name (added out of band) must not error on migrate.
//
// A database that's been running the pre-fix plain-INSERT code for a while (any real
// staging/production, unlike this session's local dev box) can genuinely have MULTIPLE rows per
// job_id already, since nothing ever stopped that before this fix. CREATE UNIQUE INDEX fails
// outright against existing duplicates, so this migration cannot apply — and the upsert it exists
// to support can never get its constraint — until they're gone (Greptile). Dedup keeps the
// newest row per job (created_at, tied-broken by id) and drops the rest: this table is
// pipeline-internal only (writeSiteIntelligence's own doc comment — nothing an admin hand-edits),
// so the latest analysis is authoritative and there's nothing worth merging from an older one.

import type { Knex } from "knex";

const S = "superadmin";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM ${S}.extraction_site_intelligence a
      USING ${S}.extraction_site_intelligence b
      WHERE a.job_id = b.job_id
        AND (a.created_at, a.id) < (b.created_at, b.id)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS extraction_site_intelligence_job_uniq
      ON ${S}.extraction_site_intelligence (job_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // The dedup delete is not reversible (the point of a migration down is to undo the SCHEMA
  // change; the duplicate rows it removed were bugged data, not something to restore).
  await knex.raw(`DROP INDEX IF EXISTS ${S}.extraction_site_intelligence_job_uniq`);
}
