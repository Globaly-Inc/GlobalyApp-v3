// The only door between AI Knowledge and the embedding provider.
//
// FAIL CLOSED, the same way billing/services/stripe.client.ts does: this
// environment may have no Gemini key, and the honest answer to "embed this" is a
// 503, not a stub vector. There is deliberately no zero-vector fallback and no
// offline stub here — a zero vector is indistinguishable from a real one at the
// column level, so it would poison cosine ranking silently and for ever.
//
// Callers run their auth, their validation and all of their database work first
// and only then ask for a provider, so everything except the outbound call is
// exercised without a key. Tests inject their own EmbeddingProvider instead.

import { AppError } from "../../../../shared/errors.js";
import { config } from "../../../../config.js";
import { EMBEDDING_DIMS, embed } from "../../data-extraction/lib/llm-client.js";

export class EmbeddingUnavailableError extends AppError {
  constructor(message = "Embedding provider is not configured") {
    super(message, 503, "EMBEDDING_UNAVAILABLE");
  }
}

export interface EmbeddingProvider {
  /** Recorded on every row so a model change can be detected without a migration. */
  readonly model: string;
  /** Must equal the width of the vector columns, or the write will be rejected. */
  readonly dims: number;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function isEmbeddingConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}

/**
 * The model every chunk is stamped with. Readable without a key so pending rows
 * can be reported against the model they are *waiting* for.
 */
export function currentEmbeddingModel(): string {
  return config.GEMINI_EMBEDDING_MODEL;
}

// ponytail: sequential calls, not Gemini's :batchEmbedContents. embed() already owns
// the REST call, the dimension check, the normalisation, the LLM_THROTTLE_MS gap and
// the 429 backoff. Swap in the batch endpoint the day the wall-clock hurts.
//
// There is deliberately no second throttle here. There used to be, and it compounded
// with withRetry()'s: a gap per chunk *and* a gap per Gemini call is the same wait
// counted twice, and only withRetry()'s is process-global — which is the one that
// matters, because the embed worker runs several documents concurrently and a
// per-batch sleep does nothing about calls made from a different message.
async function embedSequentially(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) out.push(await embed(text));
  return out;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!isEmbeddingConfigured()) throw new EmbeddingUnavailableError();
  // Built per call, not at module load: config is mutable and the model may be
  // switched between runs (that is the whole point of recording it per row).
  return { model: currentEmbeddingModel(), dims: EMBEDDING_DIMS, embedBatch: embedSequentially };
}
