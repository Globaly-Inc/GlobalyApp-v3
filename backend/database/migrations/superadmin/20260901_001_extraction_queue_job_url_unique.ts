import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_queue";

// A queue item's identity is (job_id, url) — the discovery step, the courses step's
// guided-URL queuing, and the page worker's pagination detection all dedupe on it with
// check-then-insert, which races when two producers overlap (e.g. concurrent re-runs)
// and yields two independently claimable rows for one URL — double scraping and double
// Gemini billing. Enforce it in the DB instead; insertQueueItem inserts with
// ON CONFLICT DO NOTHING and skips dispatch when another producer already won.
export async function up(knex: Knex): Promise<void> {
  // Dedupe existing rows (the pre-2026-08-31 discovery step re-queued duplicates on every
  // re-run). Keep the most-advanced row per (job_id, url): completed first — deleting a
  // completed row's pending twin avoids re-extracting a page that already succeeded —
  // then processing (its in-flight worker finishes against the kept row instead of a
  // pending twin getting dispatched for a second scrape + extraction), then the most
  // recently touched.
  await knex.raw(`
    DELETE FROM ${S}.${TABLE} q
    USING (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY job_id, url
        ORDER BY (status = 'completed') DESC, (status = 'processing') DESC, updated_at DESC NULLS LAST, created_at DESC
      ) AS rn
      FROM ${S}.${TABLE}
    ) ranked
    WHERE q.id = ranked.id AND ranked.rn > 1
  `);

  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.unique(["job_id", "url"], { indexName: "extraction_queue_job_id_url_uniq" });
  });
}

export async function down(knex: Knex): Promise<void> {
  // The dedupe delete is not reversible; this only removes the constraint.
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropUnique(["job_id", "url"], "extraction_queue_job_id_url_uniq");
  });
}
