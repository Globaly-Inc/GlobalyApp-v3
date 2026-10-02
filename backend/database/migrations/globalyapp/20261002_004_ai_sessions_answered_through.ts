import type { Knex } from "knex";

// The newest visitor message the AI has taken on after a takeover lapsed. A resume claims the
// unanswered questions by moving this forward in one UPDATE, so two tabs (or a reload mid-reply)
// can't both answer them; a normal turn skips anything at or below it.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_counselor_sessions ADD COLUMN IF NOT EXISTS answered_through_message_id integer NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_counselor_sessions DROP COLUMN IF EXISTS answered_through_message_id`);
}
