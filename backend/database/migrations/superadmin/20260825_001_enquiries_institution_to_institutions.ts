import type { Knex } from "knex";

// enquiries.institution_id: superadmin.extraction_institution_overview.id (uuid)
//                        -> public.institutions.id (integer).
//
// `institutions` is the canonical institution entity — what promote publishes, what the
// public search page lists, and what an admin can unpublish. The overview row is raw
// scraped data. The extraction side stays reachable through the new chain:
//   enquiries.institution_id -> institutions.id -> institutions.source_job_id -> extraction_jobs.id
//
// This lives in the superadmin env, not globalyapp, for the same run-order reason as
// 20260815_001_cross_schema_fks: the backfill below reads
// superadmin.extraction_institution_overview, which does not exist yet while the
// globalyapp env is migrating. 20260815_001 is deliberately left untouched — on a fresh
// database it adds the old FK against the uuid column and this migration converts it, so
// both fresh and already-migrated databases end in the same state.
//
// The type changes (uuid -> integer), so it is an add/backfill/swap rather than an
// ALTER TYPE: Postgres has no uuid -> integer cast. No views depend on the column.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_institution_id_foreign`);
  await knex.raw(`ALTER TABLE public.enquiries ADD COLUMN institution_id_int integer`);

  // Faithful conversion of the existing value: overview row -> its job -> the institution
  // promoted from that job. institutions_source_job_uniq makes source_job_id at most 1:1,
  // so this join has exactly one candidate per row.
  const mapped = await knex.raw(`
    UPDATE public.enquiries e
       SET institution_id_int = i.id
      FROM superadmin.extraction_institution_overview o
      JOIN public.institutions i ON i.source_job_id = o.job_id AND i.deleted_at IS NULL
     WHERE o.id = e.institution_id
  `);

  // Rows the first pass could not resolve — the overview row was deleted, or the job never
  // had one — but whose job WAS promoted. extraction_job_id reaches the same institution by
  // the same relationship, so resolving them is a repair, not a guess. Enquiries whose job
  // was never promoted stay NULL, which is what the nullable column has always meant.
  const viaJob = await knex.raw(`
    UPDATE public.enquiries e
       SET institution_id_int = i.id
      FROM public.institutions i
     WHERE i.source_job_id = e.extraction_job_id
       AND i.deleted_at IS NULL
       AND e.institution_id_int IS NULL
  `);

  // Counted before the old column is dropped: rows that HAD an institution and now do not,
  // i.e. the job behind them was never promoted (or was soft-deleted). Printed rather than
  // failed on — a stale pointer into raw extraction data is not worth blocking a deploy.
  const { rows: unresolved } = await knex.raw(`
    SELECT count(*)::int AS count FROM public.enquiries
     WHERE institution_id IS NOT NULL AND institution_id_int IS NULL
  `);
  console.log(
    `[migration] enquiries.institution_id -> institutions.id: ${mapped.rowCount} via overview, ` +
      `${viaJob.rowCount} via extraction_job_id, ${unresolved[0].count} dropped to NULL (job not promoted)`,
  );

  await knex.raw(`ALTER TABLE public.enquiries DROP COLUMN institution_id`);
  await knex.raw(`ALTER TABLE public.enquiries RENAME COLUMN institution_id_int TO institution_id`);
  await knex.raw(`
    ALTER TABLE public.enquiries
      ADD CONSTRAINT enquiries_institution_id_foreign
        FOREIGN KEY (institution_id) REFERENCES public.institutions (id) ON DELETE SET NULL
  `);
}

// Reverses the swap. Enquiries that up() resolved via extraction_job_id for a job with no
// overview row come back NULL — the uuid they would need never existed.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_institution_id_foreign`);
  await knex.raw(`ALTER TABLE public.enquiries ADD COLUMN institution_id_uuid uuid`);
  // A correlated LIMIT 1, not an UPDATE ... FROM join: extraction_institution_overview.job_id
  // carries no unique constraint (1:1 only by convention), and a join over a job with two
  // overview rows lets Postgres restore whichever one it happens to reach — a different uuid
  // on every rollback. Oldest row wins, id breaking ties, so the result is reproducible.
  await knex.raw(`
    UPDATE public.enquiries e
       SET institution_id_uuid = (
             SELECT o.id
               FROM public.institutions i
               JOIN superadmin.extraction_institution_overview o ON o.job_id = i.source_job_id
              WHERE i.id = e.institution_id
              ORDER BY o.created_at, o.id
              LIMIT 1
           )
     WHERE e.institution_id IS NOT NULL
  `);
  await knex.raw(`ALTER TABLE public.enquiries DROP COLUMN institution_id`);
  await knex.raw(`ALTER TABLE public.enquiries RENAME COLUMN institution_id_uuid TO institution_id`);
  await knex.raw(`
    ALTER TABLE public.enquiries
      ADD CONSTRAINT enquiries_institution_id_foreign
        FOREIGN KEY (institution_id) REFERENCES superadmin.extraction_institution_overview (id) ON DELETE SET NULL
  `);
}
