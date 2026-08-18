// Worker — consumes "ai_knowledge_embed". Run with: npm run job:ai-knowledge-embed
//
// Turns crawled documents into retrievable chunks: chunk the markdown, embed each
// chunk, record which model produced each vector. Two message shapes:
//
//   { "documentId": "<uuid>" }   one document — published by the crawl worker after
//                               it adds or updates a page
//   { "limit": 200 }            a sweep tick — drains whatever is still unembedded,
//                               which is how the 207 migrated documents get done
//
// Idempotent over a re-delivered message: handleEmbedMessage() compares the
// document's content_hash and the configured model against what the chunk rows
// already carry and returns without touching Postgres or the provider.
//
// Fail-closed: with no GEMINI_API_KEY the chunks are still written (they are useful
// to a human reader and to the text leg of hybrid retrieval) but no vector is
// invented. The worker logs how many rows are waiting and acks — redelivering would
// not conjure a key.
//
// The body lives in the module (services/embedding.service.ts) so it is testable
// without a broker: importing this file starts a consumer.

import "dotenv/config";
import { queueService } from "../shared/queue/queueService.js";
import { createChildLogger } from "../shared/logger.js";
import { KNOWLEDGE_QUEUES } from "../modules/superadmin/ai-knowledge/shared/queues.js";
import { handleEmbedMessage } from "../modules/superadmin/ai-knowledge/services/embedding.service.js";

const logger = createChildLogger("ai-knowledge-embed-worker");

await queueService.consume(KNOWLEDGE_QUEUES.EMBED, async (msg) => {
  await handleEmbedMessage(msg!.content.toString());
});

logger.info(`AI Knowledge embed worker started — consuming "${KNOWLEDGE_QUEUES.EMBED}" queue`);
