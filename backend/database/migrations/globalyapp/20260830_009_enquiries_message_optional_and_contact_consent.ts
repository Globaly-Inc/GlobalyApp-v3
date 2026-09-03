import type { Knex } from "knex";

/**
 * Two changes to how an enquiry carries the student's own data. One migration because neither had
 * been applied yet, and they belong to the same piece of work: what the student is obliged to give
 * up in order to enquire.
 *
 * ── 1. `message` becomes optional ──
 *
 * The form asks for a course, an intake and a message; only the course identifies what the student
 * wants. Requiring prose — and at least 10 characters of it — turned "tell me about this course"
 * into a writing task, on the one action the whole funnel depends on.
 *
 * The 10-character floor goes rather than being kept for non-null values. If a message can be
 * absent entirely, a two-word one is no worse, and "optional, but at least 10 characters if you
 * type anything" reads as a bug from the outside. The 5000 ceiling stays: it protects the column
 * and the emails that render it. Empty string is normalised to NULL in the service, so "absent"
 * has exactly one representation.
 *
 * ── 2. `share_contact_number` ──
 *
 * Whether the student agreed to share their phone number with a business that unlocks this
 * enquiry. Stored on the enquiry rather than the profile because consent is given per enquiry, at
 * submission, for that specific course — a profile-level flag would silently apply one decision to
 * every future enquiry.
 *
 * DEFAULT false is the safe backfill: every enquiry submitted before this column existed recorded
 * no consent, and absence of consent is not consent. No phone number becomes newly visible.
 *
 * Both halves are guarded, so a partially-applied database converges rather than erroring.
 */
export async function up(knex: Knex): Promise<void> {
  // Idempotent: dropping NOT NULL from an already-nullable column is a no-op in Postgres.
  await knex.raw(`ALTER TABLE enquiries ALTER COLUMN message DROP NOT NULL`);
  await knex.raw(`ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS chk_enquiries_message_length`);
  // NULL satisfies a CHECK in Postgres, so this constrains only messages that exist.
  await knex.raw(`
    ALTER TABLE enquiries
      ADD CONSTRAINT chk_enquiries_message_length
      CHECK (message IS NULL OR char_length(message) <= 5000)
  `);

  if (!(await knex.schema.hasColumn("enquiries", "share_contact_number"))) {
    await knex.schema.alterTable("enquiries", (t) => {
      t.boolean("share_contact_number").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("enquiries", "share_contact_number")) {
    await knex.schema.alterTable("enquiries", (t) => t.dropColumn("share_contact_number"));
  }

  await knex.raw(`ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS chk_enquiries_message_length`);
  // Rows that went in without a message cannot satisfy the old floor; a placeholder is the only
  // way back that does not delete a student's enquiry.
  await knex("enquiries")
    .where((q) => q.whereNull("message").orWhereRaw("char_length(message) < 10"))
    .update({ message: "No message provided." });
  await knex.raw(`ALTER TABLE enquiries ALTER COLUMN message SET NOT NULL`);
  await knex.raw(`
    ALTER TABLE enquiries
      ADD CONSTRAINT chk_enquiries_message_length
      CHECK (char_length(message) BETWEEN 10 AND 5000)
  `);
}
