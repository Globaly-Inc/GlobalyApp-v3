// Phase 6 — chunk-level retrieval + uploaded file sources.
//
// Whole-page embeddings dilute long documents (one vector averaging a 9,000-word
// government page matches nothing well) and rag.service could only afford to send
// the first 1,500 chars of each hit. Chunks fix both: one vector per section, and
// the whole section reaches the model.
//
// This is a hard cutover, not a phased one: ai_knowledge_documents was empty when
// this ran (0 rows), so there was nothing for a document-level fallback to serve
// and no backfill window to protect. The whole-page path — documents.embedding, its
// HNSW index and match_ai_knowledge_documents() — goes in the same migration. down()
// restores all three exactly as 20260820_001 left them.

import type { Knex } from "knex";

const S = "superadmin";
const EMBEDDING_DIMS = 3072;

const DROP_FN = `DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_chunks(vector, int, text, text)`;
const DROP_DOC_FN = `DROP FUNCTION IF EXISTS ${S}.match_ai_knowledge_documents(vector, int, text, text)`;

/** The document-level function as 20260820_001 created it — only down() needs it back. */
const CREATE_DOC_FN = `
  CREATE FUNCTION ${S}.match_ai_knowledge_documents(
    query_embedding vector(${EMBEDDING_DIMS}),
    match_count int DEFAULT 5,
    filter_category_kind text DEFAULT NULL,
    filter_country_code text DEFAULT NULL
  )
  RETURNS TABLE (
    id uuid, url text, title text, markdown text,
    similarity float, category_label text, source_domain text, trust_tier text
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT d.id, d.url, d.title, d.markdown,
           1 - (d.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})) AS similarity,
           c.label AS category_label,
           s.domain AS source_domain,
           s.trust_tier
    FROM ${S}.ai_knowledge_documents d
    JOIN ${S}.ai_knowledge_categories c ON c.id = d.category_id
    JOIN ${S}.ai_knowledge_sources s ON s.id = d.source_id
    WHERE d.active
      AND d.embedding IS NOT NULL
      AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
      AND (filter_country_code IS NULL OR c.country_code IS NULL OR c.country_code = filter_country_code)
    ORDER BY d.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})
    LIMIT match_count
  $$;
`;

export async function up(knex: Knex): Promise<void> {
  // ── Uploaded sources: same table as URLs, so they inherit trust_tier, category,
  // active, doc_count and the audit trail for free. ──

  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    t.text("source_type").notNullable().defaultTo("url"); // url | file
    t.text("file_path").nullable(); // GCS object path, uploads only
    t.text("file_name").nullable(); // original filename — the citation for an upload
    t.text("mime_type").nullable();
    t.text("country_code").nullable(); // per-source override of the category's country
  });

  // A file source has no URL to crawl; a URL source has no file. One or the other.
  await knex.raw(`ALTER TABLE ${S}.ai_knowledge_sources ALTER COLUMN url DROP NOT NULL`);
  await knex.raw(`
    ALTER TABLE ${S}.ai_knowledge_sources
    ADD CONSTRAINT ai_knowledge_sources_ingest_path_check CHECK (
      (source_type = 'url'  AND url IS NOT NULL) OR
      (source_type = 'file' AND file_path IS NOT NULL)
    )
  `);
  // Postgres allows repeated NULLs, so this coexists with the existing (category_id, url).
  await knex.raw(
    `ALTER TABLE ${S}.ai_knowledge_sources
     ADD CONSTRAINT ai_knowledge_sources_category_id_file_path_unique UNIQUE (category_id, file_path)`,
  );

  // ── Chunk bookkeeping on the document ──

  await knex.schema.withSchema(S).alterTable("ai_knowledge_documents", (t) => {
    // Denormalised so the admin list can show "12 chunks in brain" without a COUNT
    // per row, and so a failed ingest is visible as chunk_count = 0.
    t.integer("chunk_count").notNullable().defaultTo(0);
  });

  // ── Chunks ──

  await knex.schema.withSchema(S).createTable("ai_knowledge_chunks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable()
      .references("id").inTable(`${S}.ai_knowledge_documents`).onDelete("CASCADE");
    t.integer("chunk_index").notNullable();
    t.text("content").notNullable();
    // "Nepal — Domestic Education System > 1. Overview > 1.1 Governing authority".
    // Makes a chunk self-describing for both retrieval and citation.
    t.text("heading_path").nullable();
    t.integer("page_number").nullable(); // PDF page attribution, NULL otherwise
    t.integer("token_count").notNullable().defaultTo(0);
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["document_id", "chunk_index"]);
  });
  await knex.raw(`CREATE INDEX idx_akc_document ON ${S}.ai_knowledge_chunks (document_id)`);
  // Same halfvec cast as the document index: pgvector HNSW caps `vector` at 2000 dims.
  await knex.raw(
    `CREATE INDEX idx_akc_embedding ON ${S}.ai_knowledge_chunks
     USING hnsw ((embedding::halfvec(${EMBEDDING_DIMS})) halfvec_cosine_ops)`,
  );

  // ── Retrieval ──

  await knex.raw(DROP_FN);
  await knex.raw(`
    CREATE FUNCTION ${S}.match_ai_knowledge_chunks(
      query_embedding vector(${EMBEDDING_DIMS}),
      match_count int DEFAULT 8,
      filter_category_kind text DEFAULT NULL,
      filter_country_code text DEFAULT NULL
    )
    RETURNS TABLE (
      id uuid, document_id uuid, content text, heading_path text, page_number int,
      similarity float, title text, url text, file_name text, source_type text,
      category_label text, source_domain text, trust_tier text
    )
    LANGUAGE sql STABLE
    AS $$
      -- Over-fetch inside the ORDER BY, then re-rank: HNSW post-filters, so a
      -- country + kind filter applied after the LIMIT can starve the result set.
      SELECT k.id, k.document_id, k.content, k.heading_path, k.page_number,
             1 - (k.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})) AS similarity,
             d.title, s.url, s.file_name, s.source_type,
             c.label AS category_label, s.domain AS source_domain, s.trust_tier
      FROM ${S}.ai_knowledge_chunks k
      JOIN ${S}.ai_knowledge_documents d  ON d.id = k.document_id
      JOIN ${S}.ai_knowledge_sources s    ON s.id = d.source_id
      JOIN ${S}.ai_knowledge_categories c ON c.id = d.category_id
      WHERE d.active
        -- Deactivating a source hides its documents too. The retired
        -- document-level function never checked this.
        AND s.active
        AND k.embedding IS NOT NULL
        AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
        AND (filter_country_code IS NULL
             OR COALESCE(s.country_code, c.country_code) IS NULL
             OR COALESCE(s.country_code, c.country_code) = filter_country_code)
      ORDER BY k.embedding::halfvec(${EMBEDDING_DIMS}) <=> query_embedding::halfvec(${EMBEDDING_DIMS})
      LIMIT match_count
    $$;
  `);

  // ── Retire the whole-page path ──
  // Nothing reads it once rag.service is on chunks, and an unread vector column
  // with a live HNSW index implies a retrieval path that no longer exists.
  await knex.raw(DROP_DOC_FN);
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_akd_documents_embedding`);
  await knex.schema.withSchema(S).alterTable("ai_knowledge_documents", (t) => {
    t.dropColumn("embedding");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("ai_knowledge_documents", (t) => {
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
  });
  await knex.raw(
    `CREATE INDEX idx_akd_documents_embedding ON ${S}.ai_knowledge_documents
     USING hnsw ((embedding::halfvec(${EMBEDDING_DIMS})) halfvec_cosine_ops)`,
  );
  await knex.raw(DROP_DOC_FN);
  await knex.raw(CREATE_DOC_FN);
  // The column and function come back empty: rolling back leaves every rack
  // document unretrievable until something re-embeds them, and this migration
  // also removed embed-backfill.ts's ai_knowledge_documents target. Restore that
  // target from git history if a rollback ever has to serve traffic.
  await knex.raw(DROP_FN);
  await knex.schema.withSchema(S).dropTableIfExists("ai_knowledge_chunks");

  await knex.schema.withSchema(S).alterTable("ai_knowledge_documents", (t) => {
    t.dropColumn("chunk_count");
  });

  await knex.raw(
    `ALTER TABLE ${S}.ai_knowledge_sources
     DROP CONSTRAINT IF EXISTS ai_knowledge_sources_category_id_file_path_unique`,
  );
  await knex.raw(
    `ALTER TABLE ${S}.ai_knowledge_sources
     DROP CONSTRAINT IF EXISTS ai_knowledge_sources_ingest_path_check`,
  );
  // Any file source has a NULL url and would break the restored NOT NULL.
  await knex.raw(`DELETE FROM ${S}.ai_knowledge_sources WHERE url IS NULL`);
  await knex.raw(`ALTER TABLE ${S}.ai_knowledge_sources ALTER COLUMN url SET NOT NULL`);

  await knex.schema.withSchema(S).alterTable("ai_knowledge_sources", (t) => {
    t.dropColumn("source_type");
    t.dropColumn("file_path");
    t.dropColumn("file_name");
    t.dropColumn("mime_type");
    t.dropColumn("country_code");
  });
}
