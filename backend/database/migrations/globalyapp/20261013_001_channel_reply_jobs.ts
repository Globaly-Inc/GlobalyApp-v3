import type { Knex } from "knex";

// One pending AI reply per channel conversation (WhatsApp, Instagram, Facebook).
//
// A customer often sends several short messages in a row ("Hello" … "List me some courses").
// Instead of one AI reply per message, each message (re)schedules this row a few seconds out;
// when it falls due the worker answers everything unanswered in one reply.
//
//   first_message_at  when the burst started; caps the wait so a customer who keeps typing still
//                     gets an answer (CHANNEL_REPLY_MAX_WAIT_MS)
//   due_at            reset by every new message (CHANNEL_REPLY_DEBOUNCE_MS), never past the cap
//   attempts          failed tries, for backoff; the job is dropped after the last one
//
// One row per conversation (unique), and the worker claims a row by DELETING it, so the same
// burst can never be answered twice. In globalyapp, not the tenant schema, so a single worker can
// find every due reply without walking every organisation's schema.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE channel_reply_jobs (
      id bigserial PRIMARY KEY,
      owner_kind text NOT NULL,
      owner_id integer NOT NULL,
      visitor_id integer NOT NULL,
      first_message_at timestamptz NOT NULL DEFAULT now(),
      due_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      CONSTRAINT chk_channel_reply_jobs_owner_kind CHECK (owner_kind IN ('business', 'institution')),
      CONSTRAINT uq_channel_reply_jobs_visitor UNIQUE (owner_kind, owner_id, visitor_id)
    );
    CREATE INDEX idx_channel_reply_jobs_due ON channel_reply_jobs (due_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS channel_reply_jobs;`);
}
