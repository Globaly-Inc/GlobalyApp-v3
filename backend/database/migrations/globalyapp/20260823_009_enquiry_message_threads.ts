import type { Knex } from "knex";

// Thread replies — GlobalyOS V2's `chat_messages.reply_to_id` and its right-hand Thread
// panel ("Reply in thread" on the hover toolbar).
//
// A self-FK, not a separate replies table: a reply IS a message — same sender, body,
// attachments, reactions, pins — and splitting it out would duplicate every one of those
// columns and every query that reads them.
//
// Threads are ONE level deep by design, matching V2: replying to a reply anchors to that
// reply's parent (V2 does `reply_to_id || id` when resolving a thread). Enforced in the
// service, since a CHECK constraint cannot follow the chain.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.integer("reply_to_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("enquiry_messages")
      // Deleting a parent takes its replies with it — an orphaned reply has no thread to
      // belong to and would silently vanish from the UI while staying in the table.
      .onDelete("CASCADE");
  });

  // Both reads are "the replies to this parent, oldest first" and "how many replies does
  // each message in this thread have".
  await knex.raw(`
    CREATE INDEX idx_enquiry_messages_reply_to
      ON enquiry_messages (reply_to_id, created_at)
      WHERE reply_to_id IS NOT NULL
  `);

  // A message cannot reply to itself. Deeper cycles are impossible anyway once the
  // service flattens to one level, and this is the cheap half to enforce declaratively.
  await knex.raw(`
    ALTER TABLE enquiry_messages
      ADD CONSTRAINT chk_enquiry_messages_reply_not_self
      CHECK (reply_to_id IS NULL OR reply_to_id <> id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE enquiry_messages DROP CONSTRAINT IF EXISTS chk_enquiry_messages_reply_not_self");
  await knex.raw("DROP INDEX IF EXISTS idx_enquiry_messages_reply_to");
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.dropColumn("reply_to_id");
  });
}
