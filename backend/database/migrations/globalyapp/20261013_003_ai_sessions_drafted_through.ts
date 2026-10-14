import type { Knex } from "knex";

// Channels in suggest-only mode: the newest customer message the waiting AI draft covers. A draft
// doesn't answer anything (staff still have to send it), so it must not move answered_through —
// this separate marker only stops a retried event regenerating the draft staff are reviewing.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_counselor_sessions ADD COLUMN IF NOT EXISTS drafted_through_message_id integer NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_counselor_sessions DROP COLUMN IF EXISTS drafted_through_message_id`);
}
