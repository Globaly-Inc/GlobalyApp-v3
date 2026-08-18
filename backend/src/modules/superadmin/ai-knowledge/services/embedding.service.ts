// Chunking + embedding pipeline: documents → chunks → vectors.
//
// Order of operations is the whole design. Every database write happens *before*
// the provider is touched, so a run without a Gemini key still produces the full
// chunk set — the rows just sit with embedding NULL and the caller is told exactly
// how many are waiting. Nothing writes a placeholder vector; see lib/embedding-provider.ts.
//
// Idempotency comes from the (document_id, content_hash, embedding_model) triple:
//   * chunks already cut from this content and embedded with this model → no-op
//   * chunks cut from this content but not embedded          → embed only those
//   * chunks cut from older content                          → re-chunk, then embed
// A re-delivered LavinMQ message therefore lands in the first case and does nothing.

import { createChildLogger } from "../../../../shared/logger.js";
import { chunkMarkdown } from "../lib/chunk.js";
import {
  EmbeddingUnavailableError,
  currentEmbeddingModel,
  getEmbeddingProvider,
  isEmbeddingConfigured,
  type EmbeddingProvider,
} from "../lib/embedding-provider.js";
import * as repo from "../repositories/chunk.repository.js";

const logger = createChildLogger("ai-knowledge-embedding");

/** Vectors are written one chunk at a time; this only bounds the provider call. */
const EMBED_BATCH = 25;

export type SkipReason = "not_found" | "inactive" | "too_short" | "already_current";

export interface EmbedDocumentResult {
  document_id: string;
  /** Chunks cut from the document's current content. */
  chunks: number;
  /** Chunks that carry a vector from the current model after this run. */
  embedded: number;
  /** Chunks still without one — non-zero only when the provider was unavailable. */
  awaiting: number;
  rechunked: boolean;
  skipped: SkipReason | null;
}

const skip = (documentId: string, reason: SkipReason, chunks = 0, embedded = 0): EmbedDocumentResult => ({
  document_id: documentId,
  chunks,
  embedded,
  awaiting: chunks - embedded,
  rechunked: false,
  skipped: reason,
});

/**
 * Chunk one document and embed whatever is not already embedded with the current
 * model. Throws EmbeddingUnavailableError (503) when there is no key — after the
 * chunks are persisted, so the work is never lost and the pending count is real.
 *
 * `provider` is injectable so the whole pipeline is testable offline.
 */
export async function embedDocument(
  documentId: string,
  provider?: EmbeddingProvider,
): Promise<EmbedDocumentResult> {
  const model = provider?.model ?? currentEmbeddingModel();

  const document = await repo.findEmbeddableDocument(documentId);
  if (!document) return skip(documentId, "not_found");
  if (!document.active) return skip(documentId, "inactive");
  if (!document.markdown || document.markdown.length <= repo.MIN_MARKDOWN_LEN) {
    return skip(documentId, "too_short");
  }

  const state = await repo.chunkState(documentId, document.content_hash, model);

  // Redelivery lands here: current chunks exist and are all embedded with this model.
  if (state.current > 0 && state.embedded === state.current && state.stale === 0) {
    return skip(documentId, "already_current", state.current, state.embedded);
  }

  // Re-chunk when there is nothing for this content, or leftovers from an older
  // revision. replaceChunks() is a single transaction, so a crash mid-run leaves
  // either the old set or the new one, never a mix.
  let chunkCount = state.current;
  let rechunked = false;
  if (state.current === 0 || state.stale > 0) {
    const chunks = chunkMarkdown(document.markdown, document.title);
    chunkCount = await repo.replaceChunks(documentId, document.content_hash, chunks);
    rechunked = true;
  }

  const pending = await repo.pendingChunks(documentId, model);
  if (pending.length === 0) {
    return { document_id: documentId, chunks: chunkCount, embedded: chunkCount, awaiting: 0, rechunked, skipped: null };
  }

  // Everything above is durable. Only now do we reach for the network.
  const resolved = provider ?? getEmbeddingProvider();

  let embedded = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const slice = pending.slice(i, i + EMBED_BATCH);
    const vectors = await resolved.embedBatch(
      slice.map((c) => (c.title ? `${c.title}\n${c.content}` : c.content)),
    );
    if (vectors.length !== slice.length) {
      throw new Error(`Embedding provider returned ${vectors.length} vectors for ${slice.length} chunks`);
    }
    for (const [j, chunk] of slice.entries()) {
      await repo.setChunkEmbedding(chunk.id, vectors[j], resolved.model);
      embedded += 1;
    }
  }

  return {
    document_id: documentId,
    chunks: chunkCount,
    embedded: chunkCount - pending.length + embedded,
    awaiting: pending.length - embedded,
    rechunked,
    skipped: null,
  };
}

export interface SweepResult {
  model: string;
  documents_seen: number;
  documents_embedded: number;
  chunks_written: number;
  chunks_embedded: number;
  chunks_awaiting: number;
  /** True when the run stopped early because the provider is not configured. */
  provider_unavailable: boolean;
}

/**
 * Drain the backlog. Chunking continues even with no key — that is the difference
 * between "the corpus is not retrievable yet" and "the corpus is not prepared".
 * The moment the provider says 503 we stop calling it, finish reporting, and leave
 * the remaining rows honestly pending.
 */
export async function embedPending(limit: number, provider?: EmbeddingProvider): Promise<SweepResult> {
  const model = provider?.model ?? currentEmbeddingModel();
  const ids = await repo.documentsAwaitingEmbedding(model, limit);

  const result: SweepResult = {
    model,
    documents_seen: ids.length,
    documents_embedded: 0,
    chunks_written: 0,
    chunks_embedded: 0,
    chunks_awaiting: 0,
    provider_unavailable: false,
  };

  for (const id of ids) {
    try {
      const one = await embedDocument(id, provider);
      if (one.rechunked) result.chunks_written += one.chunks;
      result.chunks_embedded += one.embedded;
      result.chunks_awaiting += one.awaiting;
      if (one.awaiting === 0 && one.chunks > 0) result.documents_embedded += 1;
    } catch (e) {
      if (e instanceof EmbeddingUnavailableError) {
        // Chunking for this document already committed; the provider is the only
        // thing that failed, so stop asking it. status() is the authoritative
        // pending count from here — the caller reports it.
        result.provider_unavailable = true;
        logger.warn("Embedding provider unavailable — chunks left pending", { documentId: id });
        break;
      }
      logger.error("Embedding failed for document", { documentId: id, error: (e as Error).message });
    }
  }

  return result;
}

export async function status() {
  const model = currentEmbeddingModel();
  return {
    embedding: {
      model,
      provider_configured: isEmbeddingConfigured(),
      ...(await repo.embeddingStatus(model)),
    },
  };
}

// ── Worker body ──
//
// Lives here rather than in src/workers/knowledge-embed.worker.ts because importing
// that file starts a LavinMQ consumer, which would make this untestable offline.

export const DEFAULT_SWEEP_LIMIT = 200;

export interface EmbedMessage {
  documentId?: string;
  limit?: number;
}

/** Returns null for anything that is not a shape this worker understands. */
export function parseEmbedMessage(raw: string): EmbedMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { documentId, limit } = parsed as EmbedMessage;
  if (documentId !== undefined && typeof documentId !== "string") return null;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit))) return null;
  return { documentId, limit };
}

export type HandledMessage =
  | { handled: "document"; result: EmbedDocumentResult }
  | { handled: "sweep"; result: SweepResult }
  | { handled: "discarded" }
  | { handled: "pending"; awaiting: number };

/**
 * One queue delivery. A malformed message is discarded (redelivering it forever
 * would not make it parse); a missing provider is reported with the real pending
 * count and acked.
 */
export async function handleEmbedMessage(
  raw: string,
  provider?: EmbeddingProvider,
): Promise<HandledMessage> {
  const message = parseEmbedMessage(raw);
  if (!message) {
    logger.error("Malformed queue message, discarding", { raw: raw.slice(0, 200) });
    return { handled: "discarded" };
  }

  try {
    if (message.documentId) {
      const result = await embedDocument(message.documentId, provider);
      logger.info("Document embedded", { ...result });
      return { handled: "document", result };
    }
    const result = await embedPending(message.limit ?? DEFAULT_SWEEP_LIMIT, provider);
    logger.info("Sweep complete", { ...result });
    return { handled: "sweep", result };
  } catch (e) {
    if (e instanceof EmbeddingUnavailableError) {
      // Chunking already committed. Say exactly how much is waiting, so "not
      // embedded" is a number on a dashboard and not an absence nobody notices.
      const { embedding } = await status();
      logger.warn("No embedding provider — chunks written, vectors pending", embedding);
      return { handled: "pending", awaiting: embedding.chunks_awaiting };
    }
    throw e;
  }
}
