import type { FastifyInstance } from "fastify";
import { GuestMessageSchema, GuestMigrateSchema } from "../schemas/chat.schema.js";
import * as guestService from "../services/guest.service.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat } from "../lib/gemini-stream.js";
import { buildSystemPrompt } from "../services/prompt.service.js";
import * as rag from "../services/rag.service.js";
import { parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { ForbiddenError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("guest-routes");

export async function guestRoutes(app: FastifyInstance) {
  // POST /guest/messages — no auth, fingerprint-gated, SSE stream
  app.post("/guest/messages", { config: { requireAuth: false } }, async (req, reply) => {
    const input = GuestMessageSchema.parse(req.body ?? {});
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;
    const fingerprintHash = guestService.hashFingerprint(input.fingerprint, ip);

    const gate = await guestService.checkGuestGate(fingerprintHash);
    if (!gate.allowed) {
      throw new ForbiddenError("Guest limit reached. Create a free account to continue chatting.");
    }

    initSSE(reply);

    try {
      // Guest-meta event
      writeEvent(reply, "guest-meta", { replies_remaining: 0, fingerprint_hash: fingerprintHash });

      // RAG search (no profile context for guests)
      const ragOutput = await rag.searchAll({
        query: input.content,
        userId: 0, // ponytail: guests have no userId, profile context will be empty
        onTrace: (step) => writeEvent(reply, "trace", { step }),
      });

      if (ragOutput.sources.length) {
        writeEvent(reply, "sources", ragOutput.sources);
      }

      const system = buildSystemPrompt({
        profile: null,
        ragContext: ragOutput.contextText,
        isFirstMessage: true,
      });

      const result = await streamChat({
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

      // Persist guest session (fire-and-forget)
      guestService.createGuestSession({
        fingerprintHash,
        messageContent: input.content,
        responseContent: cleanText,
        responseSources: ragOutput.sources,
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

  // POST /guest/migrate — auth required
  app.post("/guest/migrate", async (req, reply) => {
    const input = GuestMigrateSchema.parse(req.body ?? {});
    const sessionId = await guestService.migrateTranscript(input.fingerprint_hash, Number(req.auth.sub));
    return reply.send({ session_id: sessionId });
  });
}
