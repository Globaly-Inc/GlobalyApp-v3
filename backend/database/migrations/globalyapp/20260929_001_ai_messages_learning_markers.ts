import type { Knex } from "knex";

// Makes an accepted learning signal recoverable after a broker outage (Greptile P2).
//
// enqueueLearning is deliberately fire-and-forget — a dead broker must never fail the user's
// write — and learning-signals.service.ts already persists the signal on the message row BEFORE
// enqueuing, so the data survives. What was missing is a way to tell a signal that was already
// learned from apart from one whose job never reached the queue. The message row is the outbox,
// so no outbox table is needed; these columns are the missing marker.
//
// TWO markers, not one: a student's thumb (`feedback`) and a counsellor's review
// (`review_status`) are INDEPENDENT signals that can both land on the same message, and they are
// learned from by different jobs. A single `learned_at` let whichever arrived first stamp the
// whole row, so the other was excluded from recovery forever (Greptile). One marker per signal.
//
// ── Why this file is named "…_learning_markers" and not "…_learned_at" ──
// An earlier revision of THIS migration, under the old filename, shipped a single `learned_at`
// column and reached a pushed branch. Knex keys on the filename, so any database that ran it
// records that name and will never re-run it — it would keep `learned_at`, never gain the two
// real columns, and every learning query would fail on a missing column (Greptile). Renaming
// makes it a migration those databases have not seen, so they run it and get repaired; the `001`
// prefix is unchanged, so ordering is identical. Everything below is written to be correct on
// BOTH populations, which is why it is raw SQL with IF [NOT] EXISTS rather than alterTable.
//
// Nullable with no backfill on purpose: every existing row reads "not yet learned", and the
// sweep's own grace window keeps it from stampeding history the first time it runs. A backfill,
// if one is ever wanted, is a script — never this file.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD COLUMN IF NOT EXISTS feedback_learned_at timestamptz,
      ADD COLUMN IF NOT EXISTS review_learned_at   timestamptz
  `);

  // Only present on a database that ran the superseded revision.
  await knex.raw(`DROP INDEX IF EXISTS ai_counselor_messages_unlearned_idx`);
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP COLUMN IF EXISTS learned_at`);

  // Partial, one per signal: the sweep only ever asks for unlearned rows carrying that signal,
  // and this table grows with every chat turn — an unqualified index would be mostly rows the
  // sweep never looks at. Separate indexes so the OR across both signals can bitmap-or them.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ai_counselor_messages_unlearned_feedback_idx
      ON ai_counselor_messages (created_at)
      WHERE feedback IS NOT NULL AND feedback_learned_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ai_counselor_messages_unlearned_review_idx
      ON ai_counselor_messages (created_at)
      WHERE review_status IS NOT NULL AND review_learned_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ai_counselor_messages_unlearned_feedback_idx`);
  await knex.raw(`DROP INDEX IF EXISTS ai_counselor_messages_unlearned_review_idx`);
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      DROP COLUMN IF EXISTS feedback_learned_at,
      DROP COLUMN IF EXISTS review_learned_at
  `);
}
