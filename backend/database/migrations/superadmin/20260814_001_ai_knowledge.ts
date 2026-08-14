// AI Knowledge — the corpus behind the Globaly AI counsellor.
//
// Two halves, ported from V2:
//   1. Curated content   — ai_knowledge_visa / _faqs / _country_guides, plus the
//                          data_verification_queue that gates community submissions.
//   2. The Knowledge Rack — categories -> sources -> documents, crawled on a schedule
//                          and embedded for retrieval.
//
// V2 put CHECK constraints on kind/trust_tier/crawl_frequency/added_via. V3 keeps
// those as plain text and validates in Zod, matching the extraction module.
// V2's uuid references to auth.users become integer admin ids here (V3 admins live
// in superadmin.admin_users); business_id stays an unconstrained uuid per the
// external-FK convention.

import type { Knex } from "knex";

const S = "superadmin";
// V2 embedded with OpenAI (1536). V3 uses Gemini text-embedding-004, which returns
// 768 — the same width superadmin.extraction_memory.embedding already uses.
const EMBEDDING_DIMS = 768;

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  // ── 1. Curated content ──

  await knex.schema.withSchema(S).createTable("ai_knowledge_visa", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("destination_country").notNullable();
    t.text("visa_type").notNullable();
    t.specificType("eligible_nationalities", "text[]").nullable();
    t.jsonb("requirements").notNullable().defaultTo("{}");
    t.specificType("required_documents", "text[]").nullable();
    t.integer("processing_time_days").nullable();
    t.integer("application_fee_usd").nullable();
    t.integer("work_rights_hours").nullable();
    t.text("post_study_visa").nullable();
    t.specificType("common_rejections", "text[]").nullable();
    t.date("last_verified_date").nullable();
    t.integer("verified_by").nullable().references("id").inTable(`${S}.admin_users`).onDelete("SET NULL");
    t.boolean("active").notNullable().defaultTo(true);
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(S).createTable("ai_knowledge_faqs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("question").notNullable();
    t.text("answer").notNullable();
    t.specificType("tags", "text[]").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.integer("created_by").nullable().references("id").inTable(`${S}.admin_users`).onDelete("SET NULL");
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(S).createTable("ai_knowledge_country_guides", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("country").notNullable().unique();
    t.text("education_system").nullable();
    t.specificType("popular_cities", "text[]").nullable();
    t.jsonb("cost_of_living_monthly_usd").nullable();
    t.text("culture_notes").nullable();
    t.text("student_life").nullable();
    t.text("climate").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.date("last_verified_date").nullable();
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // submitted_by is a plain integer: submissions come from platform users OR admins,
  // told apart by submitter_type, so it can't reference a single table.
  await knex.schema.withSchema(S).createTable("data_verification_queue", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("submitted_by").notNullable();
    t.text("submitter_type").notNullable();
    t.text("data_type").notNullable();
    t.uuid("data_id").notNullable();
    t.text("status").notNullable().defaultTo("pending");
    t.text("rejection_reason").nullable();
    t.integer("reviewed_by").nullable().references("id").inTable(`${S}.admin_users`).onDelete("SET NULL");
    t.timestamp("reviewed_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    `CREATE INDEX idx_dvq_status_created ON ${S}.data_verification_queue (status, created_at DESC)`,
  );

  // ── 2. Knowledge Rack ──

  await knex.schema.withSchema(S).createTable("ai_knowledge_categories", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("slug").notNullable().unique();
    t.text("label").notNullable();
    t.text("kind").notNullable();
    t.text("country_code").nullable();
    t.text("description").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(S).createTable("ai_knowledge_sources", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("category_id").notNullable()
      .references("id").inTable(`${S}.ai_knowledge_categories`).onDelete("CASCADE");
    t.text("url").notNullable();
    t.text("domain").notNullable();
    t.text("title").nullable();
    t.text("trust_tier").notNullable().defaultTo("other");
    t.uuid("business_id").nullable(); // FK target lives outside this schema
    t.text("crawl_frequency").notNullable().defaultTo("monthly");
    t.timestamp("last_crawled_at", { useTz: true }).nullable();
    t.text("last_status").nullable();
    t.text("last_error").nullable();
    t.integer("doc_count").notNullable().defaultTo(0);
    t.boolean("active").notNullable().defaultTo(true);
    t.integer("added_by").nullable();
    t.text("added_via").notNullable().defaultTo("manual");
    t.integer("max_pages").nullable();
    t.jsonb("crawl_summary").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["category_id", "url"]);
  });
  await knex.raw(`CREATE INDEX idx_akd_sources_category ON ${S}.ai_knowledge_sources (category_id)`);
  await knex.raw(`CREATE INDEX idx_akd_sources_domain ON ${S}.ai_knowledge_sources (domain)`);
  // The crawl worker's work-list query.
  await knex.raw(
    `CREATE INDEX idx_akd_sources_due ON ${S}.ai_knowledge_sources (crawl_frequency, last_crawled_at)
     WHERE active AND crawl_frequency <> 'off'`,
  );

  await knex.schema.withSchema(S).createTable("ai_knowledge_documents", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("source_id").notNullable()
      .references("id").inTable(`${S}.ai_knowledge_sources`).onDelete("CASCADE");
    t.uuid("category_id").notNullable()
      .references("id").inTable(`${S}.ai_knowledge_categories`).onDelete("CASCADE");
    t.text("url").notNullable();
    t.text("title").nullable();
    t.text("markdown").notNullable();
    t.text("content_hash").notNullable();
    t.integer("word_count").notNullable().defaultTo(0);
    t.timestamp("crawled_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["source_id", "url"]);
  });
  await knex.raw(`CREATE INDEX idx_akd_documents_source ON ${S}.ai_knowledge_documents (source_id)`);
  await knex.raw(`CREATE INDEX idx_akd_documents_category ON ${S}.ai_knowledge_documents (category_id)`);
  await knex.raw(
    `CREATE INDEX idx_akd_documents_title_trgm ON ${S}.ai_knowledge_documents USING gin (title gin_trgm_ops)`,
  );
  // Re-embedding after a re-crawl finds rows by hash; also drives the "stale" state.
  await knex.raw(`CREATE INDEX idx_akd_documents_hash ON ${S}.ai_knowledge_documents (content_hash)`);

  // ── 3. Retrieval ──
  // ivfflat needs rows to build meaningful lists, so it is created empty here and
  // should be REINDEXed once the corpus is populated.
  await knex.raw(
    `CREATE INDEX idx_akd_documents_embedding ON ${S}.ai_knowledge_documents
     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
  );

  await knex.raw(`
    CREATE FUNCTION ${S}.match_ai_knowledge_documents(
      query_embedding vector(${EMBEDDING_DIMS}),
      match_count int DEFAULT 5,
      filter_category_kind text DEFAULT NULL,
      filter_country_code text DEFAULT NULL
    )
    RETURNS TABLE (
      id uuid, url text, title text, markdown text,
      similarity float, category_label text, source_domain text
    )
    LANGUAGE sql STABLE
    AS $$
      SELECT d.id, d.url, d.title, d.markdown,
             1 - (d.embedding <=> query_embedding) AS similarity,
             c.label AS category_label,
             s.domain AS source_domain
      FROM ${S}.ai_knowledge_documents d
      JOIN ${S}.ai_knowledge_categories c ON c.id = d.category_id
      JOIN ${S}.ai_knowledge_sources s ON s.id = d.source_id
      WHERE d.active
        AND d.embedding IS NOT NULL
        AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
        AND (filter_country_code IS NULL OR c.country_code IS NULL OR c.country_code = filter_country_code)
      ORDER BY d.embedding <=> query_embedding
      LIMIT match_count
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_documents(vector, int, text, text)`);
  for (const table of [
    "ai_knowledge_documents",
    "ai_knowledge_sources",
    "ai_knowledge_categories",
    "data_verification_queue",
    "ai_knowledge_country_guides",
    "ai_knowledge_faqs",
    "ai_knowledge_visa",
  ]) {
    await knex.schema.withSchema(S).dropTableIfExists(table);
  }
}
