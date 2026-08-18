// Dispatch side of the embedding pipeline: validate, look, then publish.
//
// Split out of embedding.service.ts so the worker never imports queueService and
// the route never imports the provider loop.

import { NotFoundError } from "../../../../shared/errors.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { logAudit } from "../../data-extraction/shared/audit.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";
import {
  EmbeddingUnavailableError,
  currentEmbeddingModel,
  isEmbeddingConfigured,
} from "../lib/embedding-provider.js";
import * as repo from "../repositories/chunk.repository.js";

const logger = createChildLogger("ai-knowledge-embed-dispatch");

/**
 * Queue embedding work. Auth, validation and every read happen first; the provider
 * check is last, so an admin with no key learns that from a 503 rather than from a
 * "dispatched: true" that quietly does nothing.
 */
export async function requestEmbedding(
  input: { document_id?: string; limit: number },
  adminId: number,
) {
  const model = currentEmbeddingModel();

  if (input.document_id) {
    const document = await repo.findEmbeddableDocument(input.document_id);
    if (!document) throw new NotFoundError("Document not found");
  }

  const awaiting = input.document_id
    ? undefined
    : (await repo.documentsAwaitingEmbedding(model, input.limit)).length;

  if (!isEmbeddingConfigured()) {
    throw new EmbeddingUnavailableError(
      "No embedding provider is configured — documents can be chunked but not embedded. " +
        "Set GEMINI_API_KEY and retry.",
    );
  }

  await queueService.publish(KNOWLEDGE_QUEUES.EMBED, {
    documentId: input.document_id,
    limit: input.limit,
  });

  await logAudit(adminId, "AI_KNOWLEDGE_EMBED_REQUEST", {
    entityType: "ai_knowledge_documents",
    entityId: input.document_id,
    details: { model, limit: input.limit },
  });
  logger.info("Queued embedding work", { documentId: input.document_id ?? null, model });

  return { dispatched: true, model, documents_awaiting: awaiting ?? 1 };
}
