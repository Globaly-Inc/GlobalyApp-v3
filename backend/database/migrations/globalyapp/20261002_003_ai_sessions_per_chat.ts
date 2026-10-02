import type { Knex } from "knex";

// One widget visitor, many chats. Until now a visitor had one thread forever; ending a chat now
// closes it (`ended_at`), and the visitor's next message opens a fresh session. Each chat keeps
// its own staff-facing summary (`summary`, the same { title, text, open[], next_step, program,
// topics, generated_at } shape the visitor's contact summary uses).
//
// The unique index moves from "one thread per visitor per widget" to "one OPEN chat per visitor
// per widget" — any number may be ended.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_counselor_sessions
      ADD COLUMN IF NOT EXISTS ended_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS summary jsonb NULL
  `);
  await knex.raw(`DROP INDEX IF EXISTS idx_ai_sessions_visitor`);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_ai_sessions_visitor
    ON ai_counselor_sessions (visitor_key, embed_config_id)
    WHERE visitor_key IS NOT NULL AND deleted_at IS NULL AND ended_at IS NULL
  `);
}

// Destructive: the old index allows one thread per visitor, so every visitor chat but the newest
// is deleted (messages cascade) before it can be restored.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM ai_counselor_sessions s
    WHERE s.visitor_key IS NOT NULL AND s.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM ai_counselor_sessions n
      WHERE n.visitor_key = s.visitor_key AND n.embed_config_id = s.embed_config_id
        AND n.deleted_at IS NULL AND n.id > s.id
    )
  `);
  await knex.raw(`DROP INDEX IF EXISTS idx_ai_sessions_visitor`);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_ai_sessions_visitor
    ON ai_counselor_sessions (visitor_key, embed_config_id)
    WHERE visitor_key IS NOT NULL AND deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE ai_counselor_sessions
      DROP COLUMN IF EXISTS summary,
      DROP COLUMN IF EXISTS ended_at
  `);
}
