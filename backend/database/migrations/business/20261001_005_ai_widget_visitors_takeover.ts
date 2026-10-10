import type { Knex } from "knex";

// Human takeover, handover requests, staff Resolve, unread, the end-of-chat rating and the stored
// summary — everything the Inbox's AI Conversations needs on the visitor row.
//
// Twin of institution/20261001_001 — same columns, different schema.
//
// Three nullable timestamps decide who answers the next visitor message:
//   handled_by_user_id set  → a staff member is answering; the AI stays silent.
//   handoff_requested_at set → the visitor asked for a person; the AI is paused while they wait.
//   neither                  → the AI answers.
// Both expire 15 minutes after handled_at / handoff_requested_at. The check is lazy, made by the
// guest route when the visitor next writes — no worker clears them.
//
// User ids are platform_users ids in globalyapp: app-level integers, no cross-schema FK. The
// names are snapshots so the list never joins across schemas.
//
// resolved_at is deliberately separate from conversation_state: Resolve is a staff action and
// must not arm the summary email that end_confirmed does.
//
// summary is the recap the chat-summary worker already writes for the email, kept instead of
// thrown away: { text, topics[] }.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD COLUMN handled_by_user_id integer NULL,
      ADD COLUMN handled_by_name text NULL,
      ADD COLUMN handled_at timestamptz NULL,
      ADD COLUMN handoff_requested_at timestamptz NULL,
      ADD COLUMN resolved_at timestamptz NULL,
      ADD COLUMN resolved_by_user_id integer NULL,
      ADD COLUMN resolved_by_name text NULL,
      ADD COLUMN unread_count integer NOT NULL DEFAULT 0,
      ADD COLUMN rating smallint NULL,
      ADD COLUMN rating_comment text NULL,
      ADD COLUMN rated_at timestamptz NULL,
      ADD COLUMN summary jsonb NULL,
      ADD CONSTRAINT chk_ai_widget_visitors_handler_pair
        CHECK ((handled_by_user_id IS NULL) = (handled_by_name IS NULL)),
      ADD CONSTRAINT chk_ai_widget_visitors_rating
        CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
      ADD CONSTRAINT chk_ai_widget_visitors_rating_comment
        CHECK (rating_comment IS NULL OR char_length(rating_comment) <= 1000)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_rating_comment,
      DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_rating,
      DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_handler_pair,
      DROP COLUMN IF EXISTS summary,
      DROP COLUMN IF EXISTS rated_at,
      DROP COLUMN IF EXISTS rating_comment,
      DROP COLUMN IF EXISTS rating,
      DROP COLUMN IF EXISTS unread_count,
      DROP COLUMN IF EXISTS resolved_by_name,
      DROP COLUMN IF EXISTS resolved_by_user_id,
      DROP COLUMN IF EXISTS resolved_at,
      DROP COLUMN IF EXISTS handoff_requested_at,
      DROP COLUMN IF EXISTS handled_at,
      DROP COLUMN IF EXISTS handled_by_name,
      DROP COLUMN IF EXISTS handled_by_user_id
  `);
}
