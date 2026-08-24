// Shared ingest tail: markdown → chunks → embeddings → rows.
//
// Both paths into the rack end here — the crawl worker (per scraped page) and the
// admin upload (per file) — so chunk sizing, embedding and the chunk_count
// bookkeeping have exactly one implementation.

import { createHash } from "node:crypto";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { embed, isConfigured as llmConfigured } from "../../data-extraction/lib/llm-client.js";
import { chunkMarkdown, embedTextFor, normaliseMarkdown } from "./chunker.js";

const logger = createChildLogger("ai-knowledge-ingest");

const CHUNKS = `${S}.ai_knowledge_chunks`;
const DOCUMENTS = `${S}.ai_knowledge_documents`;

/** Embedding requests in flight at once. Gemini is per-call, so this is the only throttle. */
const EMBED_CONCURRENCY = 5;
/** Vectors are ~60KB of text each — insert in small batches, not one giant statement. */
const INSERT_BATCH = 10;

export interface IngestResult {
  chunks: number;
  embedded: number;
}

/**
 * Change detection hash, taken over the NORMALISED text — that is the text the
 * chunker sees, so it is what actually determines the chunks. Hashing the raw bytes
 * instead makes a trailing-whitespace edit look like a content change and burns a
 * full re-embed of the document for nothing.
 */
export const contentHashOf = (markdown: string): string =>
  createHash("sha256").update(normaliseMarkdown(markdown)).digest("hex");

export const wordsIn = (markdown: string): number =>
  markdown.split(/\s+/).filter(Boolean).length;


/**
 * Chunk a document, embed each chunk and replace whatever chunks it had before.
 *
 * Embedding is best-effort per chunk: a chunk with no vector is still readable in
 * the admin UI, it just cannot be retrieved yet — same contract the whole-document
 * embedding had. Re-running is safe and idempotent: old chunks go first.
 */
export async function ingestDocumentChunks(
  documentId: string,
  markdown: string,
  opts: { title?: string | null } = {},
): Promise<IngestResult> {
  const normalised = normaliseMarkdown(markdown);
  const chunks = chunkMarkdown(normalised);

  // Stale chunks must go even when the new content yields none, or retrieval keeps
  // serving text that is no longer in the document.
  await masterKnex(CHUNKS).where({ document_id: documentId }).delete();

  if (!chunks.length) {
    await masterKnex(DOCUMENTS).where({ id: documentId }).update({ chunk_count: 0 });
    return { chunks: 0, embedded: 0 };
  }

  const textFor = (index: number) => {
    const chunk = chunks[index];
    return embedTextFor(chunk.content, chunk.heading_path, opts.title);
  };

  const vectors: Array<number[] | null> = new Array(chunks.length).fill(null);
  if (llmConfigured()) {
    for (let start = 0; start < chunks.length; start += EMBED_CONCURRENCY) {
      const batch = chunks.slice(start, start + EMBED_CONCURRENCY).map((_, offset) => {
        const index = start + offset;
        return embed(textFor(index))
          .then((vector) => { vectors[index] = vector; })
          .catch((e: Error) => {
            logger.warn("Chunk embedding failed", { documentId, index, error: e.message });
          });
      });
      await Promise.all(batch);
    }
  }

  const rows = chunks.map((chunk, index) => ({
    document_id: documentId,
    chunk_index: index,
    content: chunk.content,
    heading_path: chunk.heading_path,
    page_number: chunk.page_number,
    token_count: chunk.token_count,
    embedding: vectors[index]
      ? masterKnex.raw("?::vector", [`[${vectors[index]!.join(",")}]`])
      : null,
  }));

  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    await masterKnex(CHUNKS).insert(rows.slice(start, start + INSERT_BATCH));
  }

  const embedded = vectors.filter(Boolean).length;
  await masterKnex(DOCUMENTS).where({ id: documentId }).update({ chunk_count: chunks.length });

  logger.info("Document chunked", { documentId, chunks: chunks.length, embedded });
  return { chunks: chunks.length, embedded };
}
