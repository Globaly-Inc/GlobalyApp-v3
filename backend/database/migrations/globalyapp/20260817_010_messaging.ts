// Messaging — conversations, participants, messages, read state.
//
// PLACEMENT (§1.2 "cross-tenant graph tables go in master", confirmed by annex W7:
// "cross-tenant FKs cannot live inside one tenant's schema"): a conversation joins a
// student (public.platform_users) to one or more businesses, and V1's invite flow lets a
// SECOND business join the same thread. Rows would therefore need FKs into two different
// tenant schemas at once, which schema-per-tenant cannot express — so the whole family
// lives in master (public). Nothing here is business-owned operational data.
//
// NO v1_id COLUMNS: §3.5/§4 disposition this family as `drop (rebuild D2)` — V1's 9
// message rows are not migrated, so there is nothing to trace back to.
//
// enquiry_id is an app-level FK (nullable integer, no REFERENCES): the enquiries table is
// D1's, shipping in the same wave, and a hard FK would make these two migrations
// order-dependent. Same precedent as agents.platform_user_id / the org refs in
// 20260816_003_cross_tenant_tables.
// ponytail: promote it to a real FK in a follow-up once both tables are on the branch.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── conversations ──
  await knex.schema.createTable("conversations", (t) => {
    t.increments("id").primary();
    t.integer("enquiry_id").unsigned().nullable(); // app-level FK to enquiries.id (D1) — see header
    t.text("title").nullable();
    t.text("status").notNullable().defaultTo("open").checkIn(["open", "closed"], "conversations_status_check");
    t.integer("created_by").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("closed_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("closed_at", { useTz: true }).nullable();
    // Bumped on every send — the conversation list orders by it, so the list never has to
    // touch conversation_messages to sort.
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // One live conversation per enquiry (V1 start-chat returned the existing one instead of
  // creating a second). Partial so soft-deleted rows don't block a re-start.
  await knex.raw(`
    CREATE UNIQUE INDEX conversations_enquiry_unique
    ON conversations (enquiry_id)
    WHERE enquiry_id IS NOT NULL AND deleted_at IS NULL
  `);

  // ── conversation_participants ──
  await knex.schema.createTable("conversation_participants", (t) => {
    t.increments("id").primary();
    t.integer("conversation_id").unsigned().notNullable()
      .references("id").inTable("conversations").onDelete("CASCADE");
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("role").notNullable()
      .checkIn(["student", "agent_member", "provider_member"], "conversation_participants_role_check");
    // Null for the student side. Institutions never appear here: an unclaimed directory
    // listing has no user accounts, so it has nobody to seat in a chat.
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("left_at", { useTz: true }).nullable();
    // Read watermark: the highest message id this participant has read. Unread count is
    // `messages in this conversation with id > watermark and sender <> me` — one indexed
    // range scan, and marking read is a single UPDATE instead of a row per message.
    // ponytail: a per-message receipts table is the upgrade path if per-message
    // delivered/read ticks are ever wanted; the watermark cannot express those.
    // Plain integer, no FK: conversation_messages is created after this table, and
    // deleting a message must not rewind anyone's read position.
    t.integer("last_read_message_id").unsigned().nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["conversation_id", "platform_user_id"], { indexName: "conversation_participants_unique" });
    t.index(["platform_user_id", "is_active"], "conversation_participants_user_idx");
  });

  // ── conversation_messages ──
  await knex.schema.createTable("conversation_messages", (t) => {
    t.increments("id").primary();
    t.integer("conversation_id").unsigned().notNullable()
      .references("id").inTable("conversations").onDelete("CASCADE");
    t.integer("sender_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("content").nullable();
    t.text("message_type").notNullable().defaultTo("text")
      .checkIn(["text", "image", "file"], "conversation_messages_type_check");
    t.text("file_url").nullable();
    t.text("file_name").nullable();
    t.integer("file_size").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at").nullable();
  });

  // History paging and the SSE tail both key on (conversation_id, id): the serial PK is
  // the tiebreaker that makes ordering total even when two inserts share a timestamp.
  await knex.raw(`CREATE INDEX conversation_messages_thread_idx ON conversation_messages (conversation_id, id)`);
  // Unread counts scan the same index but skip the caller's own messages.
  await knex.raw(`CREATE INDEX conversation_messages_sender_idx ON conversation_messages (conversation_id, sender_id)`);

  await knex.raw(`
    ALTER TABLE conversation_messages
    ADD CONSTRAINT conversation_messages_body_check
    CHECK (content IS NOT NULL OR file_url IS NOT NULL)
  `);

  await knex.raw(`
    ALTER TABLE conversation_participants
    ADD CONSTRAINT conversation_participants_business_check
    CHECK ((role = 'student') = (business_id IS NULL))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("conversation_messages");
  await knex.schema.dropTableIfExists("conversation_participants");
  await knex.schema.dropTableIfExists("conversations");
}
