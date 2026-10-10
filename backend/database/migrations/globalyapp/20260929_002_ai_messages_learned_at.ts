import type { Knex } from "knex";

// Per-signal learning markers on ai_counselor_messages: feedback_learned_at + review_learned_at.
// See 20260929_001_ai_messages_learning_markers.ts for why the same work exists under two names.
//
// ── Why this file still exists ──
// It was briefly RENAMED to ..._learning_markers.ts, and that rename reached origin. Knex records
// the FILENAME of every migration it runs and refuses to run anything at all when a recorded file
// is missing — "The migration directory is corrupt, the following files are missing: …" — so
// deleting this name would hard-block every future migration on any database that ran it
// (Greptile; reproduced against a scratch DB). Both names have now been on origin, so both must
// stay on disk forever, and both are written to be idempotent: whichever runs second is a no-op,
// and every database converges on the same schema no matter which it has already recorded.
//
// Do not "tidy up" by deleting either file. The cost is one redundant no-op migration; the cost
// of removing one is a team that cannot migrate.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD COLUMN IF NOT EXISTS feedback_learned_at timestamptz,
      ADD COLUMN IF NOT EXISTS review_learned_at   timestamptz
  `);
  // Only present on a database that ran the very first revision of this file.
  await knex.raw(`DROP INDEX IF EXISTS ai_counselor_messages_unlearned_idx`);
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP COLUMN IF EXISTS learned_at`);
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

// Deliberately a no-op: the sibling migration owns the teardown, and dropping the columns here
// would strip them from a database whose recorded history still shows the sibling as applied.
export async function down(): Promise<void> {}
