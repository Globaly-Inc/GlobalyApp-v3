// Phase 8 — evolving counselling context per session.
//
// The static profile (platform_user_profiles) holds what the student filled in on a
// form. This holds what they told the counsellor in conversation: goals, interests,
// constraints, where they are in the journey. The model writes it through the
// update_student_context tool and reads it back on every later turn of the session,
// so it stops re-asking what it was already told.
//
// Session-scoped on purpose: a new session starts fresh unless the student agrees to
// promote something into their real profile. Nothing here is auto-copied there.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.jsonb("counselling_context").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.dropColumn("counselling_context");
  });
}
