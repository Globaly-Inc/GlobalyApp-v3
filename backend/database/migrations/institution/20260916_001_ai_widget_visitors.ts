import type { Knex } from "knex";

// The anonymous visitors of this tenant's AI embed widget — one row per visitor per widget,
// created on their FIRST message and updated for the rest of the conversation.
//
// Deliberately the SAME table name as the business template (business/20260916_001),
// for the same reason business_enquiries is: an institution and a business work their widget
// the same way, and the schema this lives in is what makes the rows theirs.
//
// Why the tenant schema rather than globalyapp, where the conversation itself lives: the
// transcript is platform infrastructure, but the visitor — a named person who asked this
// institution about its courses — is the tenant's own record. The cost is that the links to
// ai_counselor_sessions and ai_embed_configs are app-level, with no real FK across schemas
// (same as business_enquiries), so nothing cascades: deleting a widget leaves its visitors,
// which is the right way round for a contact record.
//
// This file absorbed 20260922_001_ai_widget_visitors_profile (the four jsonb columns) while the
// feature was still unshipped. Knex identifies a migration by FILENAME, so that consolidation
// required dropping the table and deleting BOTH ledger rows from every tenant schema first —
// folding columns into an already-applied filename otherwise applies nothing, silently, and
// reports "already up to date".
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_widget_visitors", (t) => {
    t.increments("id").primary();

    // sha256(fingerprint:embed_key) — the SAME value globalyapp.ai_counselor_sessions.visitor_key
    // holds, so the two rows are joinable without storing the raw browser fingerprint anywhere.
    t.text("visitor_key").notNullable();
    t.integer("embed_config_id").notNullable(); // app-level FK to globalyapp.ai_embed_configs.id
    t.integer("session_id").nullable(); // app-level FK to globalyapp.ai_counselor_sessions.id

    t.text("name").nullable();
    t.text("email").nullable();

    // ── Contact capture: asked on a message count, answered or declined ──
    t.text("contact_status").notNullable().defaultTo("not_shown");
    t.integer("contact_prompt_count").notNullable().defaultTo(0);
    // message_count at the moment of the last prompt. The cooldown is measured in messages,
    // not minutes — a visitor who steps away for an hour should not come back to a fresh ask.
    t.integer("contact_prompted_at_count").nullable();
    t.timestamp("contact_prompted_at", { useTz: true }).nullable();
    t.timestamp("contact_submitted_at", { useTz: true }).nullable();

    // ── Where the conversation is in its life ──
    // Unlike the contact prompt, WHEN to first offer to wrap up is a judgement about whether the
    // enquiry was resolved, which no message count can express — so a model makes it, in its own
    // call over the transcript (see lib/conclusion-detect). And it is offered only ONCE:
    // end_prompt_count is what enforces that. The message-gap cooldown this replaced
    // (ai_embed_configs.end_prompt_cooldown, since dropped) existed because declining used to
    // cost the visitor their summary; the idle fallback now sends one regardless, so there is
    // nothing to keep re-offering. end_prompt_at_count survives as a record of WHEN the offer
    // went out, read by nothing.
    t.text("conversation_state").notNullable().defaultTo("active");
    t.integer("end_prompt_count").notNullable().defaultTo(0);
    t.integer("end_prompt_at_count").nullable();
    t.timestamp("end_confirmed_at", { useTz: true }).nullable();

    t.integer("message_count").notNullable().defaultTo(0);
    t.timestamp("first_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // ── What the visitor told the counsellor about themselves ──
    // Four columns because the platform-user side has four tables — platform_user_qualifications,
    // platform_user_language_tests, platform_user_academic_tests, platform_user_work_experiences —
    // and the field names inside each array are theirs verbatim. A visitor who later signs up
    // should be a straight copy into those tables, not a translation.
    //
    // ARRAYS, not objects: every one of those tables is one-to-many. A student has two degrees,
    // an IELTS and a PTE, three jobs. Storing one object each would silently keep only the last
    // thing they mentioned.
    //
    // jsonb rather than four child tables, and this is the trade being made deliberately: this
    // data is SELF-REPORTED by an anonymous visitor and EXTRACTED BY A MODEL from prose. It is a
    // lead signal, not a record. Giving it real tables with real constraints would dress a guess
    // up as a fact, and the moment it has a foreign key someone will join eligibility to it.
    // Keep it soft, keep it in one row, and promote it only when a human has confirmed it.
    //
    // NULL, not '[]': null means the visitor never raised the subject, an empty array would mean
    // they did and had none. The difference matters when reading these as lead qualification.
    t.jsonb("qualifications").nullable();
    t.jsonb("language_tests").nullable();
    t.jsonb("academic_tests").nullable();
    t.jsonb("work_experiences").nullable();

    // ── Summary email ──
    // NULL until an address exists. 'pending' means OWED, not due: confirming the end of the
    // chat makes it due immediately, and the quiet-hour fallback covers everyone else.
    t.text("summary_status").nullable();
    t.integer("summary_attempts").notNullable().defaultTo(0);
    t.timestamp("summary_sent_at", { useTz: true }).nullable();
    t.text("summary_error").nullable();

    t.timestamps(true, true);

    // The dedupe that makes "don't create a second user for the same visitor" structural
    // rather than a race the app has to win.
    t.unique(["visitor_key", "embed_config_id"], { indexName: "ai_widget_visitors_key_idx" });
  });

  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_contact_status
      CHECK (contact_status IN ('not_shown','shown','skipped','submitted'))
  `);

  // 'shown' is a fourth state beyond not_shown/skipped/submitted, and it is needed: a card that
  // was displayed but neither submitted nor dismissed is not 'not_shown', and it must feed the
  // same cooldown as a decline or ignoring it would re-trigger on the very next message.
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_conversation_state
      CHECK (conversation_state IN ('active','ending_prompt_shown','continue','end_confirmed'))
  `);

  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_summary_status
      CHECK (summary_status IS NULL OR summary_status IN ('pending','processing','sent','failed'))
  `);

  // A name without an email cannot be mailed and an email without a name cannot be greeted;
  // half a contact is not a lesser contact, it is a bug that got this far.
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_contact_pair
      CHECK ((name IS NULL) = (email IS NULL))
  `);

  // Each profile column must be an ARRAY if present. Postgres is the only place that can hold
  // this line: the writer merges model output into whatever is already there, and a single
  // object slipping in would make every later merge concatenate against a non-array and throw
  // mid-conversation.
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_profile_arrays
      CHECK (
        (qualifications   IS NULL OR jsonb_typeof(qualifications)   = 'array') AND
        (language_tests   IS NULL OR jsonb_typeof(language_tests)   = 'array') AND
        (academic_tests   IS NULL OR jsonb_typeof(academic_tests)   = 'array') AND
        (work_experiences IS NULL OR jsonb_typeof(work_experiences) = 'array')
      )
  `);

  // The summary sweep's only access path: owed summaries that are either confirmed or quiet.
  // Columns match chat-summary.worker's predicate exactly — summary_status = 'pending' AND
  // email IS NOT NULL AND (conversation_state = 'end_confirmed' OR last_activity_at < cutoff).
  // The earlier version of this index also carried closed_at, for a leave beacon that has since
  // been removed; the column is gone with it.
  await knex.raw(`
    CREATE INDEX ai_widget_visitors_summary_due_idx
      ON ai_widget_visitors (conversation_state, last_activity_at)
      WHERE summary_status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_widget_visitors");
}
