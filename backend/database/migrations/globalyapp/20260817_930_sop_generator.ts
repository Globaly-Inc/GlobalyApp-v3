// SOP generator — the guided Statement-of-Purpose pipeline (Wave E5).
//
// ── GREENFIELD, verified ──
// §3.7 records the SOP generator as "used in prod". It is not. V1's repo carries
// supabase/migrations/20260701101635_ai_sop_generator.sql, but the 199-table live-V1
// census (scripts/migration/v1-tables.json, captured from the frozen project's
// `migration-export /tables` endpoint on 2026-07-16) contains none of its six
// tables, and neither does the v1_staging extract in the dev database. So the V1
// migration was authored and never applied: there are zero rows to migrate and no
// production behaviour bound to the old shape.
//
// V2 is therefore the only DDL reference (§1.2.1 parity-first) — and V2's
// "redesign" is a verbatim column port of two of V1's six tables
// (sopIntakeSessions, aiGeneratedDocuments), with sop_config, sop_country_guides,
// conversation_answers and sop_generation_logs simply dropped. V1's six-table
// pipeline is the fuller shape, so it is the one carried here.
//
// ── why master (`public`) ──
// §1.2: an SOP is owned by a platform_user, who has no candidate tenant schema.
// The institution it targets and the course inside that institution's schema are
// references *out* of master, which is the only direction that works — a tenant
// schema could not hold a row FK'd to another tenant's course.
//
// `course_service_id` is an unconstrained uuid for exactly that reason, following
// `enquiries.service_id` (20260817_100): the target lives in the target org's own
// schema, so the FK is enforced at the application boundary, not by Postgres.
//
// ── divergences from V1, deliberate ──
//  * `content_v1` is DROPPED. V1 copied version 1's text onto every later version
//    row and then recovered it with `versions.find(v => v.version === 1)?.content_v1
//    ?? versions[0].content_v1` — a denormalised duplicate with two ways to
//    disagree. Version 1's own `content` is the baseline; edit depth reads it.
//  * `UNIQUE (session_id, document_type, version)` and a partial unique index on
//    the current row. V1 had neither, so two rows could carry is_current = true for
//    the same document and "the current draft" became whichever the ORDER BY
//    happened to return (defect D-E5-1). The partial index is on a NOT NULL boolean,
//    so `WHERE is_current` actually matches — the G6 nullable-UNIQUE trap avoided.
//  * `conversation_answers` → `sop_conversation_answers`. V1 put a table called
//    `conversation_answers` in the shared public schema for one feature's
//    questionnaire; V3's master schema is platform-wide and the name is a squatter.
//  * `sop_generation_logs` is append-only. V1 enforced that with RLS policies
//    (`FOR UPDATE USING (false)`), which V3 does not use; the repository exposes
//    insert and select only, and there is no updated_at to tempt a writer.
//  * `status` gains `pending_provider`: an unconfigured platform 503s *after* the
//    questionnaire and the attempt are durable, so the session records honestly
//    that everything is saved and only generation is outstanding. V1 threw from
//    resolveAIProvider() before touching the database and answered 500 with the
//    raw internal message (defect D-E5-2).

import type { Knex } from "knex";

const DOCUMENT_TYPES = ["university_sop", "visa_sop", "ucas_statement"] as const;

const SESSION_STATUSES = [
  "in_progress",
  "ready_to_generate",
  "generating",
  "generated",
  "pending_provider",
  "failed",
  "abandoned",
] as const;

const SESSION_STAGES = ["zone_a", "zone_b", "stage1_draft", "stage2_refine", "complete"] as const;

const inList = (col: string, values: readonly string[]) =>
  `${col} IN (${values.map((v) => `'${v}'`).join(", ")})`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sop_intake_sessions", (t) => {
    t.increments("id").primary();
    // V1 ids are uuids. Carried for the same reason enquiries carries it: a future
    // Stage-2 load stays idempotent. Nothing populates it today.
    t.uuid("v1_id").nullable().unique();

    t.integer("student_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    // The org the SOP is addressed to. Polymorphic because V3 splits V1's
    // `businesses` into owner-backed businesses and unclaimed institutions
    // (20260817_100's precedent). App-level FK.
    t.text("target_org_type").nullable();
    t.integer("target_org_id").unsigned().nullable();

    // The course, as a uuid inside the target org's tenant schema. See header.
    t.uuid("course_service_id").nullable();

    t.integer("country_id").unsigned().nullable()
      .references("id").inTable("countries").onDelete("SET NULL");

    // Who started it. Equal to student_id today; the column exists because V1's
    // agent-delegated intake sets it to the agent, and the E5 route surface is
    // student-only (see the module header).
    t.integer("initiated_by").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.boolean("is_agent_initiated").notNullable().defaultTo(false);

    // Zone A: the profile as it stood when the session opened, so a later profile
    // edit cannot silently change what the draft was grounded in.
    t.jsonb("profile_snapshot").notNullable().defaultTo("{}");
    t.jsonb("chat_history").notNullable().defaultTo("[]");

    t.text("status").notNullable().defaultTo("in_progress");
    t.text("stage").notNullable().defaultTo("zone_a");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["student_id", "created_at"], "sop_sessions_student_created_idx");
    t.check(inList("status", SESSION_STATUSES), [], "sop_sessions_status_check");
    t.check(inList("stage", SESSION_STAGES), [], "sop_sessions_stage_check");
  });

  await knex.schema.createTable("sop_conversation_answers", (t) => {
    t.increments("id").primary();
    t.integer("session_id").unsigned().notNullable()
      .references("id").inTable("sop_intake_sessions").onDelete("CASCADE");
    t.text("question_key").notNullable();
    t.text("answer").nullable();
    t.jsonb("answer_json").nullable();
    t.timestamps(true, true);

    t.unique(["session_id", "question_key"], { indexName: "sop_answers_session_question_uq" });
  });

  await knex.schema.createTable("sop_documents", (t) => {
    t.increments("id").primary();
    t.integer("session_id").unsigned().notNullable()
      .references("id").inTable("sop_intake_sessions").onDelete("CASCADE");
    t.integer("created_by").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("document_type").notNullable();
    t.integer("version").notNullable().defaultTo(1);
    t.boolean("is_current").notNullable().defaultTo(true);

    t.text("content").notNullable();
    t.integer("word_count").nullable();
    t.integer("char_count").nullable();

    t.integer("quality_score").nullable();
    t.jsonb("quality_breakdown").notNullable().defaultTo("{}");
    // Percentage of version 1's text this version has changed. 0 on version 1.
    t.decimal("edit_depth_pct", 5, 2).notNullable().defaultTo(0);
    t.jsonb("analysis").notNullable().defaultTo("{}");

    t.timestamps(true, true);

    t.check(inList("document_type", DOCUMENT_TYPES), [], "sop_documents_type_check");
    t.check("version >= 1", [], "sop_documents_version_check");
    t.check(
      "quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)",
      [],
      "sop_documents_quality_check",
    );
    t.unique(["session_id", "document_type", "version"], {
      indexName: "sop_documents_session_type_version_uq",
    });
  });

  // Exactly one current row per (session, document_type). is_current is NOT NULL,
  // so this predicate is never NULL and the constraint always applies.
  await knex.raw(
    `CREATE UNIQUE INDEX sop_documents_current_uq
       ON sop_documents (session_id, document_type)
       WHERE is_current`,
  );

  await knex.schema.createTable("sop_config", (t) => {
    t.increments("id").primary();
    // ISO-3166 alpha-2, matching countries.iso2. Not an FK: config is seeded for
    // destinations the countries table may not carry a row for yet, and V1 keyed
    // it on the code too.
    t.text("country_code").notNullable();
    t.text("document_type").notNullable();
    t.integer("min_words").nullable();
    t.integer("max_words").nullable();
    t.integer("max_chars").nullable();
    t.specificType("banned_phrases", "text[]").notNullable().defaultTo("{}");
    t.jsonb("compliance_rules").notNullable().defaultTo("{}");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.check(inList("document_type", DOCUMENT_TYPES), [], "sop_config_type_check");
    t.unique(["country_code", "document_type"], { indexName: "sop_config_country_type_uq" });
  });

  // SOP *writing* guidance, per destination. Distinct from
  // superadmin.ai_knowledge_country_guides (E1), which is RAG corpus about living
  // and studying in a country — education system, cost of living, student life.
  // These are the dos/don'ts and refusal reasons that go into the SOP prompt.
  await knex.schema.createTable("sop_country_guides", (t) => {
    t.increments("id").primary();
    t.text("country_code").notNullable().unique();
    t.specificType("key_requirements", "text[]").notNullable().defaultTo("{}");
    t.specificType("dos", "text[]").notNullable().defaultTo("{}");
    t.specificType("donts", "text[]").notNullable().defaultTo("{}");
    t.specificType("common_refusal_reasons", "text[]").notNullable().defaultTo("{}");
    t.text("notes").nullable();
    t.timestamps(true, true);
  });

  // Append-only. See the header: insert and select only, and no updated_at.
  await knex.schema.createTable("sop_generation_logs", (t) => {
    t.increments("id").primary();
    t.integer("session_id").unsigned().notNullable()
      .references("id").inTable("sop_intake_sessions").onDelete("CASCADE");
    t.integer("student_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("initiated_by").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("action").notNullable();
    t.integer("credits_charged").notNullable().defaultTo(0);
    t.text("status").notNullable().defaultTo("success");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("status IN ('success', 'failed')", [], "sop_logs_status_check");
    t.check("credits_charged >= 0", [], "sop_logs_credits_check");
    t.index(["session_id", "created_at"], "sop_logs_session_created_idx");
    t.index(["student_id", "created_at"], "sop_logs_student_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sop_generation_logs");
  await knex.schema.dropTableIfExists("sop_country_guides");
  await knex.schema.dropTableIfExists("sop_config");
  await knex.raw(`DROP INDEX IF EXISTS sop_documents_current_uq`);
  await knex.schema.dropTableIfExists("sop_documents");
  await knex.schema.dropTableIfExists("sop_conversation_answers");
  await knex.schema.dropTableIfExists("sop_intake_sessions");
}
