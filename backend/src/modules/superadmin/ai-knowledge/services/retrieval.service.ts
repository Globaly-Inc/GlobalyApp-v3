// The public face of AI Knowledge retrieval.
//
// This is the function the AI counsellor calls (see the note at the bottom for the
// wiring E2 needs). It owns exactly two decisions the repository should not:
//
//   1. Turning the user's question into a query vector — and what to do when there
//      is no key. Retrieval does NOT 503 by default: the text leg alone is a real,
//      useful answer, and the counsellor already treats a missing embedding as
//      non-fatal. What it must never do is pretend nothing happened, so every
//      degraded answer carries `degraded: true` and a reason the caller can log,
//      surface, or refuse to accept (`requireVector: true` turns it back into a 503).
//   2. Flattening chunks into prompt context, so every consumer formats the same way.

import { createChildLogger } from "../../../../shared/logger.js";
import {
  EmbeddingUnavailableError,
  currentEmbeddingModel,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "../lib/embedding-provider.js";
import * as repo from "../repositories/retrieval.repository.js";
import type { RetrievalLegs, RetrievedChunk } from "../repositories/retrieval.repository.js";

const logger = createChildLogger("ai-knowledge-retrieval");

export type DegradedReason = "embedding_unavailable" | "embedding_failed";

export interface RetrieveOptions {
  query: string;
  topK?: number;
  categoryKind?: string | null;
  countryCode?: string | null;
  /** "hybrid" in production. "vector"/"text" exist so the fusion can be measured. */
  legs?: RetrievalLegs;
  /** Injected by tests and by the recall gate; production leaves it unset. */
  provider?: EmbeddingProvider;
  /** Refuse to answer without the vector leg — 503 instead of a degraded result. */
  requireVector?: boolean;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  legs: RetrievalLegs;
  /** Which legs actually ran. Differs from `legs` when the vector leg was skipped. */
  vector_leg: boolean;
  text_leg: boolean;
  degraded: boolean;
  degraded_reason: DegradedReason | null;
  model: string;
}

async function embedQuery(
  query: string,
  provider: EmbeddingProvider | undefined,
): Promise<{ vector: number[] | null; reason: DegradedReason | null }> {
  const resolved = provider ?? getEmbeddingProvider();
  const [vector] = await resolved.embedBatch([query]);
  if (!vector) return { vector: null, reason: "embedding_failed" };
  return { vector, reason: null };
}

export async function retrieve(opts: RetrieveOptions): Promise<RetrievalResult> {
  const legs = opts.legs ?? "hybrid";
  const query = opts.query.trim();

  let vector: number[] | null = null;
  let reason: DegradedReason | null = null;

  if (query && legs !== "text") {
    try {
      ({ vector, reason } = await embedQuery(query, opts.provider));
    } catch (e) {
      if (e instanceof EmbeddingUnavailableError && !opts.requireVector) {
        // Deliberate, reported degradation — not a silent fallback.
        reason = "embedding_unavailable";
        logger.warn("Retrieval running text-only — no embedding provider configured");
      } else if (e instanceof EmbeddingUnavailableError) {
        throw e;
      } else {
        if (opts.requireVector) throw e;
        reason = "embedding_failed";
        logger.warn("Query embedding failed — falling back to the text leg", {
          error: (e as Error).message,
        });
      }
    }
  }

  const chunks = await repo.hybridSearch({
    queryText: query,
    queryEmbedding: vector,
    topK: opts.topK,
    categoryKind: opts.categoryKind,
    countryCode: opts.countryCode,
    legs,
  });

  return {
    chunks,
    legs,
    vector_leg: vector != null && legs !== "text",
    text_leg: query.length > 0 && legs !== "vector",
    degraded: legs === "hybrid" && vector == null,
    degraded_reason: reason,
    model: currentEmbeddingModel(),
  };
}

export interface KnowledgeContext {
  contextText: string;
  sources: Array<{ type: "knowledge"; id: string; title: string; url: string }>;
}

/**
 * Flatten retrieved chunks into prompt context. Same shape as ai-counsellor's
 * RagOutput.sources so it drops straight into the existing context builder.
 */
export function toContext(chunks: RetrievedChunk[]): KnowledgeContext {
  if (chunks.length === 0) return { contextText: "", sources: [] };

  const lines = ["--- KNOWLEDGE BASE ---"];
  const sources: KnowledgeContext["sources"] = [];

  for (const c of chunks) {
    lines.push(
      `Source: ${c.title ?? c.url} (${c.source_domain}, ${c.category_label})`,
      c.content,
      `  URL: ${c.url}`,
      "",
    );
    sources.push({
      type: "knowledge",
      id: c.id,
      title: c.title ?? c.url,
      url: c.url,
    });
  }

  return { contextText: lines.join("\n"), sources };
}

// ── For agent E2 (ai-counsellor) ──
//
// ai-counsellor/services/rag.service.ts currently searches the extraction_* tables
// with ILIKE and never touches the knowledge base. To add it, put this alongside the
// existing Promise.all legs in searchAll():
//
//   import { retrieve, toContext } from "../../superadmin/ai-knowledge/services/retrieval.service.js";
//   ...
//   const kb = await retrieve({ query: opts.query, topK: 5 })
//     .then(r => { trace(`Knowledge base: ${r.chunks.length} chunks${r.degraded ? " (text-only)" : ""}`); return r; })
//     .catch(err => { logger.warn("Knowledge search failed", { err: String(err) }); return null; });
//   if (kb?.chunks.length) {
//     const ctx = toContext(kb.chunks);
//     parts.push(ctx.contextText);
//     sources.push(...ctx.sources);
//   }
//
// It is deliberately not wired here: src/modules/ai-counsellor/** belongs to E2.
