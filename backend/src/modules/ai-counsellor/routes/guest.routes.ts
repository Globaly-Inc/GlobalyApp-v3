import type { FastifyInstance, FastifyRequest } from "fastify";
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
 * Per-route limits for the two PUBLIC, unauthenticated endpoints in this module.
 *
 * The embed key is deliberately public — it sits in the script tag on the institution's
 * own website — and embed visitors skip the one-reply fingerprint gate. Without a limit
 * here, anyone could read a university's key off its homepage and spend its whole monthly
 * allowance (default 1000) in about two minutes at the global 600/min, each message
 * costing a scrape-free but real Gemini call plus an embedding. The global limit is also
 * keyed on IP alone, which one office behind a NAT shares.
 *
 * Keyed on embed key + IP so one abusive visitor cannot exhaust the widget for everyone
 * else on that site, and one busy site cannot exhaust another.
 *
 * `hook: "preHandler"` is required, not cosmetic: @fastify/rate-limit runs keyGenerator on
 * `onRequest` by default, where `req.body` does not exist yet — the POST key would silently
 * degrade to "no-key:ip" and every widget on the internet would share one bucket per IP.
 */
const MESSAGE_RATE = { max: 12, timeWindow: "1 minute", hook: "preHandler" } as const;
const SESSION_RATE = { max: 30, timeWindow: "1 minute", hook: "preHandler" } as const;

/**
 * `embed_key:ip`, falling back to IP for a plain (non-widget) guest.
 *
 * `req.ip` ONLY — never `x-forwarded-for` directly. That header is caller-supplied, so
 * reading it here let anyone rotate it and mint a fresh bucket per request, which turns a
 * 12/min limit into no limit at all while still billing the institution for every model
 * call. `req.ip` is the socket peer unless TRUST_PROXY says how many hops to believe.
 */
function embedRateKey(req: FastifyRequest): string {
  const body = (req.body ?? {}) as { embed_key?: unknown };
  const query = (req.query ?? {}) as { embed_key?: unknown };
  const key = typeof body.embed_key === "string" ? body.embed_key
    : typeof query.embed_key === "string" ? query.embed_key
    : "no-key";
  return `${key}:${req.ip}`;
}

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
  app.post("/guest/messages", {
    config: { rateLimit: { ...MESSAGE_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const input = GuestMessageSchema.parse(req.body ?? {});
    // Same reason as embedRateKey: taking x-forwarded-for here meant a plain guest could
    // rotate the header for an unlimited supply of "first" replies past the signup wall.
    const ip = req.ip;
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
  app.get("/guest/session", {
    config: { rateLimit: { ...SESSION_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
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
