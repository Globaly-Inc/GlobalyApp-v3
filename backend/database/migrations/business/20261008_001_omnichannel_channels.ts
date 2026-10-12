import type { Knex } from "knex";

// Omnichannel inbox: WhatsApp, Instagram and Facebook Messenger conversations, through Zernio.
//
// Twin of institution/20261008_001 — same tables, different schema.
//
// A channel conversation IS an ai_widget_visitors row, deliberately: that row already carries
// everything a conversation needs (takeover, the 15-minute resume, unread, resolve, notes, the
// staff and contact summaries), so every channel gets those for free. `channel` says where the
// row came from; 'ai_embed' (the default) keeps every existing widget row exactly as it was.
//
// For a channel row, visitor_key is 'zernio:<conversationId>' and embed_config_id is the
// organisation's own widget config (its AI settings and knowledge) — see channels/services.
//
// channel_connections: one row per connected WhatsApp number / Instagram account / Facebook Page.
// zernio_account_id is Zernio's account id (hex text); the globalyapp zernio_accounts row points
// back here by that id, not by a cross-schema FK.
//
// attention_reason: why AI flagged the conversation for the team (Needs Attention). A customer
// asking for a person keeps using handoff_requested_at, as the widget does.
//   ai_unsure  AI could not answer reliably    sensitive  refusals, complaints, hardship
//   other_app  Meta handed the thread to another app (Page Inbox, Business Agent)
//   suggest    suggest-only mode: ai_draft holds the reply AI wrote for a person to send
//
// ai_widget_visitor_stars: per-person stars, so one teammate's star doesn't change another's list.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE channel_connections (
      id serial PRIMARY KEY,
      channel text NOT NULL,
      zernio_account_id text NOT NULL,
      display_name text NOT NULL,
      handle text NULL,
      status text NOT NULL DEFAULT 'connected',
      ai_mode text NOT NULL DEFAULT 'auto',
      ai_config jsonb NOT NULL DEFAULT '{}',
      quality text NULL,
      error_message text NULL,
      connected_by_user_id integer NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      disconnected_at timestamptz NULL,
      CONSTRAINT chk_channel_connections_channel CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
      CONSTRAINT chk_channel_connections_status CHECK (status IN ('connected', 'error', 'disconnected')),
      CONSTRAINT chk_channel_connections_ai_mode CHECK (ai_mode IN ('auto', 'suggest')),
      CONSTRAINT uq_channel_connections_account UNIQUE (zernio_account_id)
    );

    ALTER TABLE ai_widget_visitors
      ADD COLUMN channel text NOT NULL DEFAULT 'ai_embed',
      ADD COLUMN channel_connection_id integer NULL REFERENCES channel_connections (id) ON DELETE SET NULL,
      ADD COLUMN zernio_conversation_id text NULL,
      ADD COLUMN channel_handle text NULL,
      ADD COLUMN last_inbound_at timestamptz NULL,
      ADD COLUMN attention_reason text NULL,
      ADD COLUMN ai_draft text NULL,
      ADD CONSTRAINT chk_ai_widget_visitors_channel
        CHECK (channel IN ('ai_embed', 'whatsapp', 'instagram', 'facebook')),
      ADD CONSTRAINT chk_ai_widget_visitors_attention
        CHECK (attention_reason IS NULL OR attention_reason IN ('ai_unsure', 'sensitive', 'other_app', 'suggest'));
    CREATE UNIQUE INDEX uq_ai_widget_visitors_zernio_conversation
      ON ai_widget_visitors (zernio_conversation_id) WHERE zernio_conversation_id IS NOT NULL;
    CREATE INDEX idx_ai_widget_visitors_channel ON ai_widget_visitors (channel, last_activity_at DESC);

    CREATE TABLE ai_widget_visitor_stars (
      visitor_id integer NOT NULL REFERENCES ai_widget_visitors (id) ON DELETE CASCADE,
      user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (visitor_id, user_id)
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS ai_widget_visitor_stars;
    DROP INDEX IF EXISTS idx_ai_widget_visitors_channel;
    DROP INDEX IF EXISTS uq_ai_widget_visitors_zernio_conversation;
    ALTER TABLE ai_widget_visitors
      DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_attention,
      DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_channel,
      DROP COLUMN IF EXISTS ai_draft,
      DROP COLUMN IF EXISTS attention_reason,
      DROP COLUMN IF EXISTS last_inbound_at,
      DROP COLUMN IF EXISTS channel_handle,
      DROP COLUMN IF EXISTS zernio_conversation_id,
      DROP COLUMN IF EXISTS channel_connection_id,
      DROP COLUMN IF EXISTS channel;
    DROP TABLE IF EXISTS channel_connections;
  `);
}
