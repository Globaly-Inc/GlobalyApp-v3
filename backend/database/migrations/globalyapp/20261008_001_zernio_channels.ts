import type { Knex } from "knex";

// Omnichannel inbox: WhatsApp, Instagram and Facebook Messenger through Zernio.
//
// These three tables live in globalyapp, not in the tenant schemas, because Zernio calls ONE
// public webhook for every organisation and each event names only a Zernio account (or profile).
// The webhook has to find the organisation before it can open that organisation's database, so
// the account → owner lookup must sit somewhere every request can read.
//
//   zernio_profiles  one Zernio profile per business or institution (created on the first connect)
//   zernio_accounts  one row per connected WhatsApp number / Instagram account / Facebook Page
//   zernio_events    raw webhook log; event_id is X-Zernio-Event-Id, identical on every retry
//
// owner_kind/owner_id is the same { kind, id } pair as ai_embed_configs' owner (Recipient).
// All Zernio ids are hex strings, so they are text.
//
// ai_counselor_messages gains delivery tracking for messages sent through Zernio:
//   provider_message_id  Zernio's message id; unique, so a re-delivered event cannot store twice
//   delivery_status      queued → sent → delivered → read, or failed
//   sent_from            'phone_app' for a reply someone typed in the WhatsApp Business app
//                        (coexistence), reported by Zernio as message.sent
//   sender_deleted_at    the customer deleted the message on their side (message.deleted); the
//                        Inbox shows "Message deleted" and AI history skips it
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE zernio_profiles (
      id serial PRIMARY KEY,
      owner_kind text NOT NULL,
      owner_id integer NOT NULL,
      profile_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_zernio_profiles_owner_kind CHECK (owner_kind IN ('business', 'institution')),
      CONSTRAINT uq_zernio_profiles_owner UNIQUE (owner_kind, owner_id),
      CONSTRAINT uq_zernio_profiles_profile UNIQUE (profile_id)
    );

    CREATE TABLE zernio_accounts (
      id serial PRIMARY KEY,
      account_id text NOT NULL,
      profile_id text NOT NULL REFERENCES zernio_profiles (profile_id) ON DELETE CASCADE,
      owner_kind text NOT NULL,
      owner_id integer NOT NULL,
      channel text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      disconnected_at timestamptz NULL,
      CONSTRAINT chk_zernio_accounts_owner_kind CHECK (owner_kind IN ('business', 'institution')),
      CONSTRAINT chk_zernio_accounts_channel CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
      CONSTRAINT uq_zernio_accounts_account UNIQUE (account_id)
    );
    CREATE INDEX idx_zernio_accounts_owner ON zernio_accounts (owner_kind, owner_id);

    CREATE TABLE zernio_events (
      id bigserial PRIMARY KEY,
      event_id text NOT NULL,
      event text NOT NULL,
      account_id text NULL,
      payload jsonb NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz NULL,
      error text NULL,
      CONSTRAINT uq_zernio_events_event UNIQUE (event_id)
    );
    CREATE INDEX idx_zernio_events_received ON zernio_events (received_at);

    ALTER TABLE ai_counselor_messages
      ADD COLUMN provider_message_id text NULL,
      ADD COLUMN delivery_status text NULL,
      ADD COLUMN delivery_error text NULL,
      ADD COLUMN sent_from text NULL,
      ADD COLUMN sender_deleted_at timestamptz NULL,
      ADD CONSTRAINT chk_ai_messages_delivery_status
        CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
      ADD CONSTRAINT chk_ai_messages_sent_from
        CHECK (sent_from IS NULL OR sent_from IN ('phone_app'));
    CREATE UNIQUE INDEX uq_ai_messages_provider_message
      ON ai_counselor_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS uq_ai_messages_provider_message;
    ALTER TABLE ai_counselor_messages
      DROP CONSTRAINT IF EXISTS chk_ai_messages_sent_from,
      DROP CONSTRAINT IF EXISTS chk_ai_messages_delivery_status,
      DROP COLUMN IF EXISTS sender_deleted_at,
      DROP COLUMN IF EXISTS sent_from,
      DROP COLUMN IF EXISTS delivery_error,
      DROP COLUMN IF EXISTS delivery_status,
      DROP COLUMN IF EXISTS provider_message_id;
    DROP TABLE IF EXISTS zernio_events;
    DROP TABLE IF EXISTS zernio_accounts;
    DROP TABLE IF EXISTS zernio_profiles;
  `);
}
