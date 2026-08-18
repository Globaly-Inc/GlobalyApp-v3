import type { FastifyInstance } from "fastify";
import { GuestMessageSchema, GuestMigrateSchema } from "../schemas/chat.schema.js";
import * as guestService from "../services/guest.service.js";
import * as embedService from "../services/embed.service.js";
import * as embedRepo from "../repositories/embed.repository.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { assertProviderConfigured, getAiProvider } from "../services/provider.js";
import { buildSystemPrompt } from "../services/prompt.service.js";
import * as rag from "../services/rag.service.js";
import { parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { ForbiddenError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("guest-routes");

/**
 * Public: anonymous chat — plain guests (1 reply, signup wall) and embed-widget
 * visitors. Registered outside the module's auth sub-scope, not inside it.
 */
export async function guestRoutes(app: FastifyInstance) {
  // POST /guest/messages — no auth, fingerprint-gated, SSE stream
  app.post("/guest/messages", async (req, reply) => {
    const input = GuestMessageSchema.parse(req.body ?? {});
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;
    const fingerprintHash = guestService.hashFingerprint(input.fingerprint, ip);

    // Embed visitors are gated by the business's monthly quota, not the
    // one-reply fingerprint wall — the widget is useless at 1 message/visitor.
    const embed = input.embed_key
      ? await embedService.buildEmbedContext(await embedService.resolveActiveConfig(input.embed_key))
      : undefined;
    if (!embed) {
      const gate = await guestService.checkGuestGate(fingerprintHash);
      if (!gate.allowed) {
        throw new ForbiddenError("Guest limit reached. Create a free account to continue chatting.");
      }
    }

    // Fail closed before a byte of stream is written — see services/provider.ts.
    assertProviderConfigured();
    const provider = getAiProvider();

    initSSE(reply);

    try {
      // Guest-meta event
      writeEvent(reply, "guest-meta", { replies_remaining: 0, fingerprint_hash: fingerprintHash });

      // RAG search (no profile context for guests)
      const ragOutput = await rag.searchAll({
        query: input.content,
        userId: 0, // ponytail: guests have no userId, profile context will be empty
        jobIds: embed?.jobIds,
        onTrace: (step) => writeEvent(reply, "trace", { step }),
      });

      if (ragOutput.sources.length) {
        writeEvent(reply, "sources", ragOutput.sources);
      }

      const system = buildSystemPrompt({
        profile: null,
        ragContext: ragOutput.contextText,
        isFirstMessage: true,
        embedConfig: embed?.config,
      });

      const result = await provider.streamChat({
        system,
        history: [],
        userMessage: input.content,
        onChunk: (chunk) => {
          writeData(reply, { choices: [{ delta: { content: chunk } }] });
        },
      });

      const cards = parseCards(result.fullText);
      const chips = parseChips(result.fullText);
      const cleanText = stripBlocks(result.fullText);

      if (cards.length) writeEvent(reply, "cards", cards);
      if (chips.length) writeEvent(reply, "chips", chips);

      writeEvent(reply, "usage", result.usage);
      writeDone(reply);

      // Guest turns are not metered against a wallet: there is none, and the
      // one-reply fingerprint gate is what caps the cost. Metering starts at signup.
      // Embed visitors instead advance the business's monthly quota — after
      // success, never on failure.
      if (embed) {
        embedRepo.incrementMonthlyUsage(embed.config.id).catch((err) =>
          logger.warn("Embed usage increment failed", { configId: embed.config.id, err: String(err) }),
        );
      }

      // Persist guest session (fire-and-forget)
      guestService.createGuestSession({
        fingerprintHash,
        messageContent: input.content,
        responseContent: cleanText,
        responseSources: ragOutput.sources,
        embedConfigId: embed?.config.id,
      }).catch((err) => logger.error("Failed to persist guest session", { err: String(err) }));
    } catch (err) {
      logger.error("Guest stream error", { err: err instanceof Error ? err.message : String(err) });
      if (!reply.raw.destroyed) {
        writeData(reply, {
          choices: [{ delta: { content: "I'm sorry, something went wrong. Please try again." } }],
        });
        writeDone(reply);
      }
    }
  });
}

/**
 * Protected: migrate a guest transcript once the visitor signs up. Registered
 * inside the module's auth scope.
 */
export async function guestMigrateRoutes(app: FastifyInstance) {
  // POST /guest/migrate — adopt the caller's guest transcript. Idempotent: a second
  // call returns the same session with migrated=false and writes nothing.
  app.post("/guest/migrate", async (req, reply) => {
    const input = GuestMigrateSchema.parse(req.body ?? {});
    const result = await guestService.migrateTranscript(input.fingerprint_hash, Number(req.auth.sub));
    return reply.send(result);
  });
}
