import type { FastifyInstance } from "fastify";
import { GuestMessageSchema, GuestMigrateSchema, GuestSessionQuerySchema } from "../schemas/chat.schema.js";
import * as guestService from "../services/guest.service.js";
import * as embedService from "../services/embed.service.js";
import * as embedRepo from "../repositories/embed.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat } from "../lib/gemini-stream.js";
import { buildSystemPrompt } from "../services/prompt.service.js";
import * as rag from "../services/rag.service.js";
import { parseBlocks, parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { ForbiddenError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("guest-routes");

/** Matches chat.service's HISTORY_LIMIT — an adopted thread must not change behaviour. */
const HISTORY_LIMIT = 20;

/**
 * Store one visitor turn as the two messages that make it up, so the thread reads the
 * same as an authenticated one and survives adoption. Sequential, not Promise.all:
 * findBySession breaks created_at ties on `id DESC`, so the user message has to get
 * the lower id or the next turn's history window can invert the pair.
 */
async function persistVisitorTurn(
  sessionId: number,
  turn: {
    content: string;
    answer: string;
    sources: unknown[];
    cards: unknown[];
    chips: unknown[];
    blocks: unknown[];
    /** streamChat reports camelCase; the messages table stores snake_case. */
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  },
) {
  await messagesRepo.create({ session_id: sessionId, role: "user", content: turn.content });
  await messagesRepo.create({
    session_id: sessionId,
    role: "assistant",
    content: turn.answer,
    sources: turn.sources,
    cards: turn.cards,
    chips: turn.chips,
    blocks: turn.blocks,
    prompt_tokens: turn.usage?.promptTokens,
    completion_tokens: turn.usage?.completionTokens,
    total_tokens: turn.usage?.totalTokens,
  });
  await sessionsRepo.incrementMessageCount(sessionId);
}

/** Public: anonymous chat — plain guests (1 reply, signup wall) and embed-widget visitors. */
export async function guestRoutes(app: FastifyInstance) {
  // POST /guest/messages — no auth, SSE stream
  app.post("/guest/messages", async (req, reply) => {
    const input = GuestMessageSchema.parse(req.body ?? {});
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;
    const fingerprintHash = guestService.hashFingerprint(input.fingerprint, ip);
    const ipHash = guestService.hashIp(ip);

    // Embed visitors are gated by the business's monthly quota, not the
    // one-reply fingerprint wall — the widget is useless at 1 message/visitor.
    const embed = input.embed_key
      ? await embedService.buildEmbedContext(await embedService.resolveActiveConfig(input.embed_key))
      : undefined;
    if (!embed) {
      const gate = await guestService.checkGuestGate(fingerprintHash, ipHash);
      if (!gate.allowed) {
        throw new ForbiddenError("Guest limit reached. Create a free account to continue chatting.");
      }
    }

    // Widget visitors get a real thread, scoped to this one widget; plain guests stay
    // stateless (their single exchange lives in ai_guest_chat_sessions).
    const session = embed && input.embed_key
      ? await guestService.resolveVisitorSession(
          guestService.visitorKey(input.fingerprint, input.embed_key),
          embed.config.id,
        )
      : null;

    initSSE(reply);

    try {
      // Read history BEFORE persisting this turn, so the model isn't handed the very
      // question it is being asked — the same ordering chat.service relies on.
      const history = session
        ? (await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT })).map((m) => ({
            role: m.role === "assistant" ? ("model" as const) : ("user" as const),
            parts: [{ text: m.content }],
          }))
        : [];

      // Guest-meta event
      writeEvent(reply, "guest-meta", {
        replies_remaining: 0,
        fingerprint_hash: fingerprintHash,
        session_id: session?.id ?? null,
      });

      // RAG search (no profile context for guests)
      const ragOutput = await rag.searchAll({
        query: input.content,
        userId: 0, // ponytail: guests have no userId, profile context will be empty
        jobIds: embed?.jobIds,
        rackInstitutionId: embed?.rackInstitutionId,
        onTrace: (step) => writeEvent(reply, "trace", { step }),
      });

      if (ragOutput.sources.length) {
        writeEvent(reply, "sources", ragOutput.sources);
      }

      const system = buildSystemPrompt({
        profile: null,
        ragContext: ragOutput.contextText,
        // A returning visitor mid-thread must not get the opening greeting again.
        isFirstMessage: history.length === 0,
        embedConfig: embed?.config,
      });

      const result = await streamChat({
        system,
        history,
        userMessage: input.content,
        onChunk: (chunk) => {
          writeData(reply, { choices: [{ delta: { content: chunk } }] });
        },
      });

      const cards = parseCards(result.fullText);
      const chips = parseChips(result.fullText);
      const blocks = parseBlocks(result.fullText);
      const cleanText = stripBlocks(result.fullText);

      if (cards.length) writeEvent(reply, "cards", cards);
      if (chips.length) writeEvent(reply, "chips", chips);
      if (blocks.length) writeEvent(reply, "blocks", blocks);

      writeEvent(reply, "usage", result.usage);
      writeDone(reply);

      // Bill the business's monthly quota (embed) — after success, never on failure
      if (embed) {
        embedRepo.incrementMonthlyUsage(embed.config.id).catch((err) =>
          logger.warn("Embed usage increment failed", { configId: embed.config.id, err: String(err) }),
        );
      }

      // Persist the turn (fire-and-forget — the reply has already been streamed).
      if (session) {
        persistVisitorTurn(session.id, {
          content: input.content,
          answer: cleanText,
          sources: ragOutput.sources,
          cards,
          chips,
          blocks,
          usage: result.usage,
        }).catch((err) => logger.error("Failed to persist visitor turn", { err: String(err) }));
      } else {
        guestService.createGuestSession({
          fingerprintHash,
          ipHash,
          messageContent: input.content,
          responseContent: cleanText,
          responseSources: ragOutput.sources,
          embedConfigId: embed?.config.id,
        }).catch((err) => logger.error("Failed to persist guest session", { err: String(err) }));
      }
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
 * Public: the visitor's existing thread for one widget, so reopening the launcher shows
 * the conversation instead of an empty panel. Returns an empty list rather than 404 for
 * a first-time visitor — no thread yet is the normal case, not an error.
 */
export async function guestSessionRoutes(app: FastifyInstance) {
  app.get("/guest/session", async (req, reply) => {
    const query = GuestSessionQuerySchema.parse(req.query ?? {});
    const config = await embedService.resolveActiveConfig(query.embed_key);
    const session = await sessionsRepo.findByVisitor(
      guestService.visitorKey(query.fingerprint, query.embed_key),
      config.id,
    );
    if (!session) return reply.send({ session_id: null, messages: [] });

    const messages = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
    return reply.send({ session_id: session.id, messages });
  });
}

/** Protected: migrate a guest transcript once the visitor signs up. */
export async function guestMigrateRoutes(app: FastifyInstance) {
  app.post("/guest/migrate", async (req, reply) => {
    const input = GuestMigrateSchema.parse(req.body ?? {});
    const sessionId = await guestService.migrateTranscript(input.fingerprint_hash, Number(req.auth.sub));
    return reply.send({ session_id: sessionId });
  });
}
