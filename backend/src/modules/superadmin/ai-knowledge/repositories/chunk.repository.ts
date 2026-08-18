// Knex queries for superadmin.ai_knowledge_chunks — the retrieval unit.
//
// Everything here is keyed on (document_id, content_hash, embedding_model). That
// triple is what makes the embed worker idempotent over a re-delivered message and
// what makes a model swap detectable without a schema change.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { Chunk } from "../lib/chunk.js";

export const CHUNKS = `${S}.ai_knowledge_chunks`;
export const DOCUMENTS = `${S}.ai_knowledge_documents`;

/** Below this a "document" is a nav bar or an error page, not knowledge. */
export const MIN_MARKDOWN_LEN = 40;

export interface EmbeddableDocument {
  id: string;
  title: string | null;
  markdown: string;
  content_hash: string;
  active: boolean;
}

export interface PendingChunk {
  id: string;
  title: string | null;
  content: string;
}

export interface ChunkState {
  /** Chunks cut from the document's *current* content. */
  current: number;
  /** Of those, how many carry a vector from the model we are asking about. */
  embedded: number;
  /** Chunks left over from an older revision of the document. */
  stale: number;
}

const vectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

export async function findEmbeddableDocument(id: string): Promise<EmbeddableDocument | undefined> {
  return masterKnex(DOCUMENTS)
    .select("id", "title", "markdown", "content_hash", "active")
    .where({ id })
    .first();
}

/**
 * The state of one document's chunks relative to a content hash and a model.
 * One round trip — the worker asks this before doing anything expensive.
 */
export async function chunkState(
  documentId: string,
  contentHash: string,
  model: string,
): Promise<ChunkState> {
  const row = await masterKnex(CHUNKS)
    .where({ document_id: documentId })
    .select(
      masterKnex.raw("count(*) FILTER (WHERE content_hash = ?) AS current", [contentHash]),
      masterKnex.raw(
        "count(*) FILTER (WHERE content_hash = ? AND embedding IS NOT NULL AND embedding_model = ?) AS embedded",
        [contentHash, model],
      ),
      masterKnex.raw("count(*) FILTER (WHERE content_hash <> ?) AS stale", [contentHash]),
    )
    .first<{ current: string; embedded: string; stale: string }>();

  return {
    current: Number(row?.current ?? 0),
    embedded: Number(row?.embedded ?? 0),
    stale: Number(row?.stale ?? 0),
  };
}

/**
 * Replace a document's chunks wholesale, in one transaction. Delete-then-insert
 * rather than upsert: chunk boundaries move when the content moves, so chunk 7 of
 * the old revision has nothing to do with chunk 7 of the new one.
 */
export async function replaceChunks(
  documentId: string,
  contentHash: string,
  chunks: Chunk[],
): Promise<number> {
  return masterKnex.transaction(async (trx) => {
    await trx(CHUNKS).where({ document_id: documentId }).delete();
    if (chunks.length === 0) return 0;
    await trx(CHUNKS).insert(
      chunks.map((c) => ({
        document_id: documentId,
        chunk_index: c.chunkIndex,
        title: c.title,
        content: c.content,
        content_hash: contentHash,
        char_count: c.charCount,
      })),
    );
    return chunks.length;
  });
}

/** Chunks of this document that have no vector, or one from a different model. */
export async function pendingChunks(documentId: string, model: string): Promise<PendingChunk[]> {
  return masterKnex(CHUNKS)
    .select("id", "title", "content")
    .where({ document_id: documentId })
    .where((b) => b.whereNull("embedding").orWhereRaw("embedding_model IS DISTINCT FROM ?", [model]))
    .orderBy("chunk_index");
}

export async function setChunkEmbedding(
  chunkId: string,
  vector: number[],
  model: string,
): Promise<void> {
  await masterKnex(CHUNKS)
    .where({ id: chunkId })
    .update({
      embedding: masterKnex.raw("?::vector", [vectorLiteral(vector)]),
      embedding_model: model,
      embedded_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });
}

/**
 * Documents that still owe work: never chunked, chunked from stale content, or
 * chunked but not embedded under the current model.
 */
export async function documentsAwaitingEmbedding(model: string, limit: number): Promise<string[]> {
  const rows = await masterKnex(`${DOCUMENTS} as d`)
    .select("d.id")
    .where("d.active", true)
    .whereRaw("length(d.markdown) > ?", [MIN_MARKDOWN_LEN])
    .where((b) =>
      b
        .whereNotExists((q) =>
          q.select(1).from(`${CHUNKS} as c`)
            .whereRaw("c.document_id = d.id")
            .whereRaw("c.content_hash = d.content_hash"),
        )
        .orWhereExists((q) =>
          q.select(1).from(`${CHUNKS} as c`)
            .whereRaw("c.document_id = d.id")
            .whereRaw("(c.embedding IS NULL OR c.embedding_model IS DISTINCT FROM ?)", [model]),
        ),
    )
    // Smallest first: a partial run still clears the most documents.
    .orderByRaw("length(d.markdown) asc")
    .limit(limit);

  return rows.map((r: { id: string }) => r.id);
}

export interface EmbeddingStatus {
  model: string;
  documents_total: number;
  documents_embedded: number;
  documents_awaiting: number;
  chunks_total: number;
  chunks_embedded: number;
  chunks_awaiting: number;
}

/** The numbers behind "how much of the corpus is actually retrievable right now". */
export async function embeddingStatus(model: string): Promise<Omit<EmbeddingStatus, "model">> {
  const [docs, chunks] = await Promise.all([
    masterKnex(`${DOCUMENTS} as d`)
      .where("d.active", true)
      .select(
        masterKnex.raw("count(*) AS total"),
        masterKnex.raw(
          `count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM ${CHUNKS} c
             WHERE c.document_id = d.id AND c.content_hash = d.content_hash
               AND c.embedding IS NOT NULL AND c.embedding_model = ?
           )) AS embedded`,
          [model],
        ),
      )
      .first<{ total: string; embedded: string }>(),
    masterKnex(CHUNKS)
      .select(
        masterKnex.raw("count(*) AS total"),
        masterKnex.raw("count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model = ?) AS embedded", [model]),
      )
      .first<{ total: string; embedded: string }>(),
  ]);

  const documentsTotal = Number(docs?.total ?? 0);
  const documentsEmbedded = Number(docs?.embedded ?? 0);
  const chunksTotal = Number(chunks?.total ?? 0);
  const chunksEmbedded = Number(chunks?.embedded ?? 0);

  return {
    documents_total: documentsTotal,
    documents_embedded: documentsEmbedded,
    documents_awaiting: documentsTotal - documentsEmbedded,
    chunks_total: chunksTotal,
    chunks_embedded: chunksEmbedded,
    chunks_awaiting: chunksTotal - chunksEmbedded,
  };
}
