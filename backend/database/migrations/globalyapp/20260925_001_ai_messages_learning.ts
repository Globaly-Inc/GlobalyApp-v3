// The institution-memory learning pipeline's inputs and outputs on platform tables.
//
// The memories themselves live in each institution's own schema
// (database/migrations/institution/20260925_001_institution_ai_memories.ts). What stays here is
// what hangs off tables that are already in public:
//
//   ai_counselor_messages.review_*     the counsellor's signal — approved / corrected (with text) / flagged
//   ai_counselor_messages.feedback_actor  hashed platform_user_id | visitor_key that set `feedback`, so
//                                      votes count distinct people, not repeat clicks from one
//                                      spoofable guest fingerprint
//   ai_counselor_messages.memory_ids   which memories shaped this reply (app-level link into the
//                                      tenant table) — feedback learns against exactly these
//   ai_embed_configs.auto_learn        per-widget opt-in for learning from whole conversations
//
// Internal columns: the student-facing message list selects explicit columns and never returns them.
//
// pgvector guard: the tenant table needs the `vector` type resolvable from (schema, public).
// SETUP.md installs it into public by hand; the superadmin migration's CREATE EXTENSION IF NOT
// EXISTS is then a no-op. On a fresh DB where that step was skipped, the superadmin connection's
// search_path (superadmin, public) would land the extension in superadmin, unreachable from a
// tenant schema — and this file runs first (globalyapp before superadmin before tenants), so it
// checks rather than assumes, and installs only when absent.

import type { Knex } from "knex";

async function ensureVectorInPublic(knex: Knex): Promise<void> {
  const { rows } = await knex.raw(`
    SELECT n.nspname AS schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector'
  `);
  const schema: string | undefined = rows[0]?.schema;
  if (!schema) { await knex.raw("CREATE EXTENSION vector WITH SCHEMA public"); return; }
  if (schema !== "public") {
    throw new Error(
      `pgvector is installed in schema "${schema}", not public. As a superuser run: ` +
      `ALTER EXTENSION vector SET SCHEMA public; then re-run migrate:globalyapp.`,
    );
  }
}

export async function up(knex: Knex): Promise<void> {
  await ensureVectorInPublic(knex);

  await knex.schema.alterTable("ai_counselor_messages", (t) => {
    t.text("review_status").nullable();
    t.text("correction").nullable();
    t.text("review_note").nullable();
    t.integer("reviewed_by").nullable();
    t.timestamp("reviewed_at", { useTz: true }).nullable();
    t.text("feedback_actor").nullable();
    t.jsonb("memory_ids").notNullable().defaultTo("[]");
  });
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
      ADD CONSTRAINT ai_messages_review_status_check
      CHECK (review_status IS NULL OR review_status IN ('approved', 'corrected', 'flagged'))
  `);

  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.boolean("auto_learn").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_embed_configs", (t) => { t.dropColumn("auto_learn"); });
  await knex.raw(`ALTER TABLE ai_counselor_messages DROP CONSTRAINT IF EXISTS ai_messages_review_status_check`);
  await knex.schema.alterTable("ai_counselor_messages", (t) => {
    t.dropColumns("review_status", "correction", "review_note", "reviewed_by", "reviewed_at", "feedback_actor", "memory_ids");
  });
}
