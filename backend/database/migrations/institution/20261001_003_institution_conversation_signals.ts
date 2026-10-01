import type { Knex } from "knex";

// One row per finished widget conversation: the shape of the journey, and what became of it.
//
// This is the §10–§11 store from the Knowledge Rack analysis. The requirement was explicit that
// `email_captured = true` is not enough — the question is which journeys produce a lead — and
// until now the only answer available was four counters in widget-analytics.service.
//
// DENORMALISED, one row per conversation, deliberately. Every question in §10 is a column read
// and every question in §11 is one GROUP BY: "which topic most often precedes a volunteered
// email" is `WHERE converted AND contact_source='volunteered' GROUP BY topic_before_conversion`.
// An event table would make the same answers a window function and buy nothing at this volume.
//
// WHAT IS NOT HERE, and this is the line that matters: no transcript, no message text, no name,
// no email, no visitor attributes. Topic labels are a fixed vocabulary (lib/conversation-topics),
// not phrases lifted from what anyone said. The journey is the institution's own analytics; the
// person is already in ai_widget_visitors, under that table's own collection rules, and joined
// from here by visitor_key when someone has the right to look. Putting an attribute in this row
// would put it outside those rules — which is the mistake the meta column's contract exists to
// prevent, one table over.
//
// Twin of business/20261001_003 — same table, different schema.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("institution_conversation_signals", (t) => {
    t.bigIncrements("id").primary();

    // app-level FK to globalyapp.ai_counselor_sessions.id — no cross-schema FK exists, as with
    // ai_widget_visitors.session_id.
    t.integer("session_id").notNullable();
    // Joins ai_widget_visitors in THIS schema. Already a hash; never the raw fingerprint.
    t.text("visitor_key").notNullable();
    t.integer("embed_config_id").notNullable();

    // ── The journey ──
    t.text("first_topic").nullable();
    /** Coarse labels in order, deduped consecutively: ["course","eligibility","fees","apply"]. */
    t.jsonb("topic_sequence").notNullable().defaultTo("[]");
    t.integer("message_count").notNullable().defaultTo(0);
    t.integer("duration_seconds").nullable();
    // NO course_interests column. It would have needed the shared MESSAGE_COLUMNS query widened
    // to carry `cards`, which changes what the learning path reads as well — and a column nothing
    // writes is the stored-but-unread fault this feature has already made three times. Add it with
    // its writer, not before.

    // ── What became of it ──
    t.boolean("converted").notNullable().defaultTo(false);
    t.text("contact_source").nullable(); // 'card' | 'volunteered'
    /** Did the counsellor ever ASK? Derived from contact_prompt_count, which already records it. */
    t.boolean("ai_prompted").notNullable().defaultTo(false);
    t.integer("messages_to_conversion").nullable();
    t.text("topic_before_conversion").nullable();
    t.timestamp("converted_at", { useTz: true }).nullable();

    /**
     * Which institution memories shaped this conversation — ties a journey back to its guidance.
     *
     * WRITTEN NOW, READ LATER, and that is deliberate rather than the stored-but-unread debt this
     * feature has made before. The difference is reconstructability: a SETTING nothing reads is
     * dead weight that can be added the day it is needed, whereas this is evidence that only
     * exists while the conversation is being recorded. Not writing it today means "did journeys
     * that followed our guidance convert better" is unanswerable for every conversation before
     * the day someone builds that panel.
     */
    t.jsonb("memory_ids").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // One row per conversation, structurally. The worker's insert names this in ON CONFLICT, so a
  // redelivered job (the queue is at-least-once) updates rather than duplicating the journey.
  await knex.raw(`
    CREATE UNIQUE INDEX institution_conversation_signals_session
      ON institution_conversation_signals (session_id)
  `);
  // The aggregate reads: converted journeys, newest first.
  await knex.raw(`
    CREATE INDEX institution_conversation_signals_converted
      ON institution_conversation_signals (converted, created_at DESC)
  `);
  await knex.raw(`
    ALTER TABLE institution_conversation_signals
      ADD CONSTRAINT chk_ics_contact_source
      CHECK (contact_source IS NULL OR contact_source IN ('card','volunteered')),
      ADD CONSTRAINT chk_ics_arrays
      CHECK (jsonb_typeof(topic_sequence) = 'array'
         AND jsonb_typeof(memory_ids) = 'array')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("institution_conversation_signals");
}
