import type { Knex } from "knex";

// The institution twin of business/20260915_001_ai_widget_contacts.ts — deliberately the SAME
// table name, for the same reason the enquiry mirror is: an institution works its widget contacts
// in the same portal screens a business does, and those read req.db("ai_widget_contacts"). The
// schema it lives in is what makes it the institution's.
//
// Central `globalyapp.ai_counselor_sessions` keeps the CONVERSATION (it has to: the guest
// endpoint is unauthenticated, messages hang off it, and a visitor who signs up is adopted
// there by swapping visitor_key for platform_user_id). What the visitor IS, as opposed to what
// they said, belongs to the one business that widget belongs to — the same split
// `business_enquiries` makes against globalyapp.enquiries.
//
// `session_id` is the join key back to the transcript, app-level: cross-schema FKs don't exist.
// One row per session, because (visitor_key, embed_config_id) is already unique centrally — one
// browser, one widget, one contact.
//
// visitor_ip is the raw req.ip, not the sha256 that ai_guest_chat_sessions stores. That table
// hashes because it only ever compares ("has this IP used its free reply?"); here the value has
// to be READ by the business, and a hash identifies nobody. For a visitor who never types a
// name — most of them, the widget has no form — the device and the IP are the whole identity.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_widget_contacts", (t) => {
    t.increments("id").primary();
    t.integer("session_id").notNullable(); // app-level FK to globalyapp.ai_counselor_sessions.id
    t.integer("embed_config_id").notNullable(); // app-level FK to globalyapp.ai_embed_configs.id
    t.text("visitor_ip").nullable();
    t.text("visitor_user_agent").nullable();
    // Only ever what the visitor typed into the chat themselves.
    t.text("visitor_email").nullable();
    t.text("visitor_phone").nullable();
    // Denormalised on purpose: the list renders it, and counting messages would mean a
    // cross-schema read per row. created_at is first seen, updated_at is last seen.
    t.integer("message_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(["session_id"]);
  });

  // The contact list: this widget's visitors, most recent first.
  await knex.raw(`
    CREATE INDEX idx_ai_widget_contacts_recent
    ON ai_widget_contacts (embed_config_id, updated_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_widget_contacts");
}
