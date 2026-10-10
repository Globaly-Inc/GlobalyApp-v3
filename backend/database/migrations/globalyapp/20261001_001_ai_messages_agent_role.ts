import type { Knex } from "knex";

// A third author on widget transcripts: a staff member who took the chat over from the AI.
//
// `sender_name` is a snapshot, not a join. The widget is public and reads these rows without a
// session, and the tenant visitor row that knows who took over lives in another schema — so the
// name travels with the message. `sender_user_id` is kept for audit and goes NULL if the user is
// deleted; the name is what the CHECK pins, so deleting a user never breaks an old transcript.
//
// No `?` and no `::` in the raw SQL — knex.raw rewrites both as bindings.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD COLUMN IF NOT EXISTS sender_user_id integer NULL REFERENCES platform_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS sender_name text NULL
  `);
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP CONSTRAINT IF EXISTS ai_messages_role_check`);
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant', 'agent'))
  `);
  // Every staff reply says who sent it, and nothing else may claim a sender.
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD CONSTRAINT ai_messages_agent_sender_check CHECK ((role = 'agent') = (sender_name IS NOT NULL))
  `);
}

// Destructive: staff replies cannot exist under the old two-role CHECK, so they are deleted first.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP CONSTRAINT IF EXISTS ai_messages_agent_sender_check`);
  await knex.raw(`DELETE FROM ai_counselor_messages WHERE role = 'agent'`);
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP CONSTRAINT IF EXISTS ai_messages_role_check`);
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant'))
  `);
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      DROP COLUMN IF EXISTS sender_name,
      DROP COLUMN IF EXISTS sender_user_id
  `);
}
