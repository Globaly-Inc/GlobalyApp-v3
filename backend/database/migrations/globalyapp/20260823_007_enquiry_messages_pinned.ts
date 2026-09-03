import type { Knex } from "knex";

// Pinning a message to the conversation — GlobalyOS V2's `chat_messages.is_pinned`,
// surfaced in its right-hand "Pinned Messages" panel.
//
// A COLUMN, not a join table, and deliberately unlike enquiry_message_stars next door:
// a pin is conversation-level state that both parties see (V2 lets any participant pin),
// so there is exactly one pin per message and it belongs on the message row. A star is
// one row per viewer per message, which is why that one needs its own table.
//
// `pinned_at` rather than a boolean: the panel orders by when things were pinned, and a
// boolean would throw that away. NULL is "not pinned", so the two columns can never
// disagree the way an is_pinned/pinned_at pair could.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.timestamp("pinned_at", { useTz: true }).nullable();
    // Who pinned it. SET NULL on delete: the pin outlives the account that made it —
    // losing an agent must not silently unpin what the student still relies on.
    t.integer("pinned_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
  });

  // Partial index: the only read is "the pinned ones in this thread", and pins are a
  // handful of rows in a table of many.
  await knex.raw(`
    CREATE INDEX idx_enquiry_messages_pinned
      ON enquiry_messages (distribution_id, pinned_at DESC)
      WHERE pinned_at IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_enquiry_messages_pinned");
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.dropColumn("pinned_by");
    t.dropColumn("pinned_at");
  });
}
