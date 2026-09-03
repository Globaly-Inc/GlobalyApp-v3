import type { Knex } from "knex";

// Emoji reactions — GlobalyOS V2's `chat_message_reactions`, rendered as the chip row
// under a message.
//
// One row per (message, person, emoji), which is what makes the composite primary key
// the whole uniqueness rule: the same person cannot react twice with the same emoji, but
// may react with several, and the chip's count is just how many rows share an emoji.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_message_reactions", (t) => {
    t.integer("message_id").unsigned().notNullable().references("id").inTable("enquiry_messages").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    // Stored as the literal emoji, as V2 does — there is no shortcode table to join to,
    // and the client already renders whatever it sent.
    t.text("emoji").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(["message_id", "user_id", "emoji"]);
  });

  // The read is always "every reaction on these messages", so message_id leads.
  await knex.raw("CREATE INDEX idx_enquiry_message_reactions_message ON enquiry_message_reactions (message_id)");

  // Guard against a client sending a paragraph as an "emoji". Generous enough for a
  // multi-codepoint emoji with skin-tone and ZWJ sequences (👨‍👩‍👧‍👦 is 11 codepoints).
  await knex.raw(`
    ALTER TABLE enquiry_message_reactions
      ADD CONSTRAINT chk_enquiry_message_reactions_emoji
      CHECK (btrim(emoji) <> '' AND char_length(emoji) <= 16)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_message_reactions");
}
