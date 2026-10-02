import type { Knex } from "knex";

// How far into the conversation the visitor was when they handed over their details.
//
// `message_count` keeps climbing after a visitor shares an email — they usually carry on asking
// things — so reading it at conversation end and calling it "messages to conversion" counts every
// later message as effort spent winning the lead. It also pushed `topic_before_conversion` past
// the hand-over, so the subject reported as "what they were asking about when they converted"
// could be a question asked afterwards. Both figures are the point of the conversion panel.
//
// A moment that is not captured when it happens cannot be reconstructed later: the transcript's
// own timestamps are not carried by the shared MESSAGE_COLUMNS query, and `contact_submitted_at`
// records WHEN but not WHERE. Hence a column, written by the two contact writers.
//
// Mirrors contact_prompted_at_count (20260916_001), which records the same thing for the moment
// the card was shown. Nullable, because rows that converted before this migration genuinely have
// no answer — and null reads as "unknown" in the aggregate rather than as zero.
//
// Twin of business/20261001_004 — same column, different schema.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.integer("contact_submitted_at_count").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.dropColumn("contact_submitted_at_count");
  });
}
