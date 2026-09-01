import type { Knex } from "knex";

/**
 * What kind of row this is: something a person typed, or something that happened to the thread.
 *
 * Membership changes are already written into the thread as messages (thread-members.service's
 * `announce`), so the roster's history lives where people actually read it. Without a
 * discriminator they render as an ordinary bubble attributed to whoever did the adding, which
 * reads as if that person typed the sentence out. GlobalyOS-V2 marks the same rows on
 * `chat_messages` and renders them as a centred one-liner instead.
 *
 * Deliberately NOT a separate events table: these rows share every column with a message, sort
 * into the same timeline, and are read by the same query. A second table would buy a second join
 * and a merge step for nothing.
 *
 * Defaults to 'message', so every existing row and every caller that does not care is unaffected.
 * The announce rows written before this migration stay 'message' — see the note in
 * thread-members.service.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.text("kind").notNullable().defaultTo("message");
  });

  // Not a plain 'system' flag: the client draws a different icon per verb — a crown for a
  // promotion, a person-plus for an invite — and the only other way to know which is to
  // pattern-match the sentence, which breaks the first time anyone rewords or translates one.
  await knex.raw(`
    ALTER TABLE enquiry_messages
      ADD CONSTRAINT enquiry_messages_kind_chk CHECK (kind IN (
        'message',
        'member_added',
        'member_removed',
        'member_left',
        'admin_granted',
        'admin_revoked',
        'renamed',
        'photo_changed'
      ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Dropping the column takes its CHECK with it.
  await knex.schema.alterTable("enquiry_messages", (t) => t.dropColumn("kind"));
}
