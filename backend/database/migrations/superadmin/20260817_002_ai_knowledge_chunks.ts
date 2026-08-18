// AI Knowledge chunks — the retrieval unit behind hybrid search.
//
// Ported from V2's knowledge_chunks (db/migrations-v2/0001_ai_counselor_phase1.sql):
// same shape, same generated tsvector, same UNIQUE natural key. Three deliberate
// differences:
//
//   1. vector(3072), not V2's vector(768). V3 runs gemini-embedding-001 at native
//      width (see EMBEDDING_DIMS in data-extraction/lib/llm-client.ts). pgvector
//      caps `vector` HNSW at 2000 dims, so the index is on a halfvec cast — the
//      same trick 20260814_001_ai_knowledge.ts already uses for documents.
//   2. document_id is a real FK to ai_knowledge_documents instead of V2's untyped
//      (source_table, source_id) pair. V3 chunks only ever come from documents;
//      a polymorphic key with one member is a join waiting to go wrong.
//   3. embedding_model / embedded_at are recorded per row. Vectors from different
//      models are not comparable under cosine distance, so the embed worker
//      re-embeds any chunk whose recorded model is not the configured one. Swapping
//      to another model of the same width is then a config change plus a worker run,
//      never a migration.

import type { Knex } from "knex";

const S = "superadmin";
// Must match EMBEDDING_DIMS in src/modules/superadmin/data-extraction/lib/llm-client.ts.
const EMBEDDING_DIMS = 3072;

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");

  await knex.schema.withSchema(S).createTable("ai_knowledge_chunks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable()
      .references("id").inTable(`${S}.ai_knowledge_documents`).onDelete("CASCADE");
    t.integer("chunk_index").notNullable();
    t.text("title").nullable();
    t.text("content").notNullable();
    // The hash of the *document* this chunk was cut from. Re-chunking is skipped
    // when the document's hash still matches, which is what makes the embed worker
    // idempotent over a re-delivered message.
    t.text("content_hash").notNullable();
    t.integer("char_count").notNullable().defaultTo(0);
    t.specificType("embedding", `vector(${EMBEDDING_DIMS})`).nullable();
    t.text("embedding_model").nullable();
    t.timestamp("embedded_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["document_id", "chunk_index"]);
  });

  // The full-text leg of hybrid retrieval. Generated so it can never drift from
  // content — Knex has no builder for GENERATED, hence the raw ALTER.
  await knex.raw(`
    ALTER TABLE ${S}.ai_knowledge_chunks
    ADD COLUMN tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || content)) STORED
  `);
  await knex.raw(`CREATE INDEX idx_akc_tsv ON ${S}.ai_knowledge_chunks USING gin (tsv)`);

  // The vector leg. halfvec cast for the same reason the documents index uses one.
  await knex.raw(
    `CREATE INDEX idx_akc_embedding ON ${S}.ai_knowledge_chunks
     USING hnsw ((embedding::halfvec(${EMBEDDING_DIMS})) halfvec_cosine_ops)`,
  );

  await knex.raw(`CREATE INDEX idx_akc_document ON ${S}.ai_knowledge_chunks (document_id)`);
  // The embed worker's backlog query: "what still has no vector?"
  await knex.raw(
    `CREATE INDEX idx_akc_pending ON ${S}.ai_knowledge_chunks (document_id) WHERE embedding IS NULL`,
  );
  // Re-embed sweeps select by recorded model.
  await knex.raw(`CREATE INDEX idx_akc_model ON ${S}.ai_knowledge_chunks (embedding_model)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("ai_knowledge_chunks");
}
