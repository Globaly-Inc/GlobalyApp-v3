// Scribe — counsellor session transcription, consent log, review and coaching.
// Wave E3.
//
// Spec: V2 `db/schema/schema.ts` (`scribe_sessions`, `scribe_consent_log`,
// `scribe_transcripts`, `scribe_reviews`, `scribe_coaching_snapshots`) for the
// column shape, V1's scribe-* edge functions for the behaviour. V2 has the
// schema but never shipped a route for it — §3.7's "no V2 route" is right about
// routes and silent about the tables, which are the better structural spec than
// reverse-engineering V1's SQL (§1.2.1 parity-first).
//
// PLACEMENT — PER-TENANT, which is §1.2's list read literally ("business-owned
// operational data: … events, scribe, training/LMS"). Unlike events and training
// (both of which had to go to master because an event is registered for, and a
// programme assigned to, platform users from anywhere, and one is literally an
// org↔org edge), scribe has no cross-business edge at all: a session belongs to
// exactly one business's counsellor. V2's `scribe_sessions.business_id` is
// therefore the tenant schema here and the column is gone.
//
// That choice is also the strongest available isolation for the most sensitive
// content in the application: a verbatim transcript of a counselling
// conversation. Business A cannot read business B's transcripts because they are
// not in the same schema, not merely because a WHERE clause says so.
//
// Cross-tier references (counsellor, student) are app-level integer FKs, the
// same convention as `agents.platform_user_id` — a tenant schema cannot hold a
// real FK into `public.platform_users` without pinning the search path in DDL.
//
// CONSENT IS A LEGAL RECORD. `scribe_consent_log` is append-only by design: the
// service never updates or deletes a row, and `student_name` is stored verbatim
// as spoken/typed at the time of consent rather than joined live from the
// student's profile, so a later profile edit cannot rewrite what was consented
// to. §3.7's activity column reads "consent log verbatim (legal)".

import type { Knex } from "knex";

const SESSION_STATUSES = ["active", "ended", "reviewed"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scribe_sessions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    // app-level FKs to public.platform_users.id (cross-tier, see header)
    t.integer("counselor_id").notNullable();
    t.integer("student_profile_id").nullable();

    // A walk-in has no account. V1 recorded a name and phone instead.
    t.text("guest_name").nullable();
    t.text("guest_phone").nullable();

    t.text("status").notNullable().defaultTo("active")
      .checkIn([...SESSION_STATUSES], "scribe_sessions_status_check");

    t.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("ended_at").nullable();
    t.integer("duration_seconds").nullable();
    t.text("language_detected").nullable();

    t.timestamps(true, true);

    t.index(["counselor_id", "created_at"], "scribe_sessions_counselor_idx");
    t.index(["status"], "scribe_sessions_status_idx");
    // A session identifies *someone*: either a platform user or a named guest.
    // V1 allowed both NULL, which produced transcripts attached to nobody.
    t.check(
      "student_profile_id IS NOT NULL OR guest_name IS NOT NULL",
      [],
      "scribe_sessions_subject_present_check",
    );
    t.check(
      "duration_seconds IS NULL OR duration_seconds >= 0",
      [],
      "scribe_sessions_duration_check",
    );
  });

  await knex.schema.createTable("scribe_consent_log", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    // One consent per session: recording either was agreed to or was not.
    t.integer("session_id").unsigned().notNullable().unique()
      .references("id").inTable("scribe_sessions").onDelete("CASCADE");
    // Verbatim at the moment of consent — never re-derived from the profile.
    t.text("student_name").notNullable();
    t.integer("student_id").nullable();
    t.integer("counselor_id").notNullable();

    // V1 stored (session, student_name, counselor, timestamp) and NOTHING ELSE.
    // The wording actually shown lived only in ScribePreSession.tsx's JSX,
    // unversioned, changing with every deploy — so a V1 consent row cannot
    // evidence what was consented to. §3.7 asks for "consent log verbatim
    // (legal)"; these four columns are what makes that true (§1.2.1 lets the
    // structure change to carry the feature in full).
    t.text("consent_text").notNullable();
    t.text("consent_version").notNullable();
    t.text("locale").nullable();
    // V1 declared `ip_address inet` and never wrote it. Stored as text so a
    // proxy-supplied value can be recorded as received rather than rejected by
    // an inet cast — this is evidence, not a routable address.
    t.text("ip_address").nullable();
    t.text("user_agent").nullable();

    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("scribe_transcripts", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("session_id").unsigned().notNullable()
      .references("id").inTable("scribe_sessions").onDelete("CASCADE");
    t.text("speaker").notNullable();
    t.text("text").notNullable();
    t.text("translation").nullable();
    t.integer("chunk_index").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    // V2's unique key. Load-bearing: a retried upload of chunk 7 must overwrite
    // chunk 7, never append a second copy of the same speech.
    t.unique(["session_id", "chunk_index"], {
      indexName: "scribe_transcripts_session_chunk_uniq",
    });
    t.check("chunk_index >= 0", [], "scribe_transcripts_chunk_index_check");
  });

  await knex.schema.createTable("scribe_reviews", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    // V2: unique on session_id — one review per session, replaced in place.
    t.integer("session_id").unsigned().notNullable().unique()
      .references("id").inTable("scribe_sessions").onDelete("CASCADE");
    t.text("counselor_notes").nullable();
    t.jsonb("action_items").notNullable().defaultTo("[]");
    t.jsonb("course_recommendations").notNullable().defaultTo("[]");
    t.jsonb("concerns").notNullable().defaultTo("[]");
    t.text("full_summary").nullable();
    // NULL until the counsellor confirms the AI draft. A generated-but-unsaved
    // review is not a counsellor's record of the meeting.
    t.timestamp("saved_at").nullable();
    t.timestamp("generated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });

  await knex.schema.createTable("scribe_coaching_snapshots", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("session_id").unsigned().notNullable()
      .references("id").inTable("scribe_sessions").onDelete("CASCADE");
    t.text("running_summary").nullable();
    t.jsonb("suggested_questions").notNullable().defaultTo("[]");
    t.jsonb("flagged_concerns").notNullable().defaultTo("[]");
    t.jsonb("topics_covered").notNullable().defaultTo("[]");
    t.jsonb("topics_remaining").notNullable().defaultTo("[]");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    t.index(["session_id", "created_at"], "scribe_coaching_session_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scribe_coaching_snapshots");
  await knex.schema.dropTableIfExists("scribe_reviews");
  await knex.schema.dropTableIfExists("scribe_transcripts");
  await knex.schema.dropTableIfExists("scribe_consent_log");
  await knex.schema.dropTableIfExists("scribe_sessions");
}
