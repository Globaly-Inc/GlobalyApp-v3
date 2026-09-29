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
// ── Why the same work exists under two filenames ──
// This file began as ..._ai_messages_learned_at.ts and was renamed to force a re-run on databases
// that had already applied the superseded single-column revision. That was WRONG: knex records the
// filename of every applied migration and refuses to run anything when a recorded file has gone —
// "The migration directory is corrupt, the following files are missing: …" — so the rename
// hard-blocked migrations for exactly the databases it meant to repair (Greptile; reproduced
// against a scratch DB). Both names have been on origin, so both stay on disk, and both are
// idempotent: whichever runs second is a no-op. Do not delete either.
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
