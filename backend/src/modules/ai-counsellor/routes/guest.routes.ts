import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import {
  GuestContactSchema,
  GuestConversationEndSchema,
  GuestMessageSchema,
  GuestMigrateSchema,
  GuestSessionQuerySchema,
} from "../schemas/chat.schema.js";
import * as guestService from "../services/guest.service.js";
import * as embedService from "../services/embed.service.js";
import * as visitorService from "../services/visitor.service.js";
import * as embedRepo from "../repositories/embed.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat } from "../lib/gemini-stream.js";
import { buildSystemPrompt } from "../services/prompt.service.js";
import * as rag from "../services/rag.service.js";
import { parseBlocks, parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { judgeConclusion } from "../lib/conclusion-detect.js";
import { extractProfile } from "../lib/profile-extract.js";
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
/** Tighter than the rest: a visitor answers a card once, maybe twice if they mistype. Shared
 *  with /guest/conversation-end, which is the same shape of one-off deliberate answer. */
const CONTACT_RATE = { max: 6, timeWindow: "1 minute", hook: "preHandler" } as const;
/** Leave beacons fire on every tab hide, which a visitor can do repeatedly without meaning anything. */

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
    /** Absent when the owner has no provisioned schema — the chat still works, see tenantDbFor. */
    visitor?: { db: Knex; id: number; nextCount: number; prompted: visitorService.PromptKind | null };
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

  // Separately guarded: a tenant schema that has not taken the ai_widget_visitors migration
  // yet must not lose the transcript that was just written above it.
  if (turn.visitor) {
    const v = turn.visitor;
    await visitorService.attempt("recordTurn", () =>
      visitorService.recordTurn(v.db, v.id, {
        prompted: v.prompted,
        nextCount: v.nextCount,
        sessionId,
      }),
    );
  }
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

    // Computed once: the session thread and the tenant's visitor row are the same identity
    // seen from two schemas, and must never be derived differently.
    const visitorKey = embed && input.embed_key
      ? guestService.visitorKey(input.fingerprint, input.embed_key)
      : null;

    // Widget visitors get a real thread, scoped to this one widget; plain guests stay
    // stateless (their single exchange lives in ai_guest_chat_sessions).
    const session = embed && visitorKey
      ? await guestService.resolveVisitorSession(visitorKey, embed.config.id)
      : null;

    // The anonymous visitor record, created on the FIRST message and reused for every one
    // after it. Resolved before the stream opens because the decision to ask for contact
    // details has to be made while we can still write to the socket — writeDone closes it
    // before the turn is persisted.
    //
    // Everything here is best-effort: the widget answering matters more than the lead.
    const tenantDb = embed
      ? await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(embed.config))
      : null;

    const visitor = embed && tenantDb && session && visitorKey
      ? await visitorService.attempt("resolveVisitor", () =>
          visitorService.resolveVisitor(tenantDb, {
            visitorKey,
            embedConfigId: embed.config.id,
            sessionId: session.id,
          }),
        )
      : null;

    const nextCount = (visitor?.message_count ?? 0) + 1;

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

      // Anything the visitor told us about themselves this turn, read from THEIR message rather
      // than the counsellor's reply — see profile-extract for why this is its own model call and
      // no longer a block the reply was supposed to carry.
      //
      // Awaited rather than fired and forgotten: the reply has already streamed, so the only cost
      // is a slightly later `done` event, and only on turns whose text mentions a test, a degree
      // or a job at all. An orphaned promise here would outlive the request and write through a
      // tenant connection nobody is holding open.
      //
      // Written in its own statement, deliberately not folded into recordTurn below: one UPDATE
      // carrying a column a lagging tenant schema lacks fails the whole write and freezes
      // message_count, which is exactly how both cards silently died a week ago. This one is
      // allowed to fail alone.
      const profile = visitor && tenantDb ? await extractProfile(input.content) : null;
      if (profile && visitor && tenantDb) {
        await visitorService.attempt("recordProfile", () =>
          visitorService.recordProfile(tenantDb, visitor.id, profile),
        );
      }

      // Which offer this turn carries — at most one. The model proposes a conclusion; state,
      // cooldown and whether we even have an address decide whether anything is shown.
      // Only "high" acts. "medium" is the model saying something is still unresolved, and
      // acting on it is exactly the premature interruption this feature exists to avoid — but
      // it is logged below, because a run of mediums is how you find out the instruction has
      // been tuned too shy.
      // ponytail: WIDGET_FORCE_END=1 stands in for the model's judgement so the wrap-up card can
      // be exercised on demand. It bypasses ONLY the judgement — state, cooldown and the
      // has-an-address check still apply, so what you see is the real decision on real data.
      // Dev only; leave it unset anywhere a visitor can reach.
      const forceEnd = process.env.WIDGET_FORCE_END === "1";

      // Whether the judgement is worth asking for at all. Rather than re-deriving the conditions
      // — they would drift from decidePrompt on the first change, which is how the
      // contact-card-at-a-natural-ending path silently died once already — ask decidePrompt
      // itself both ways. If the outcome is identical whether the chat concluded or not, the
      // answer cannot change anything and the call is pure cost.
      //
      // This subsumes shouldDetectConclusion exactly: a settled summary returns null both ways,
      // and an already-ended chat skips the concluded branch both ways. It is also strictly
      // tighter — once end_prompt_count hits 1 the offer is spent, and we stop asking forever.
      const judgementMatters = !!embed && !!visitor && !forceEnd &&
        visitorService.decidePrompt(visitor, nextCount, true) !==
          visitorService.decidePrompt(visitor, nextCount, false);

      // Asked as its own call, over the transcript, rather than as a block the counsellor was
      // supposed to append to its own reply. See conclusion-detect for why that never fired.
      const concluded = judgementMatters && visitor
        ? await judgeConclusion(history, input.content, cleanText)
        : null;

      const prompted = embed && visitor
        ? visitorService.decidePrompt(visitor, nextCount, forceEnd || concluded?.likelihood === "high")
        : null;

      // Why no card appeared is otherwise unanswerable: a missing visitor row, a gate that was
      // never open, a model that declined to signal and a cooldown all look identical from the
      // outside. One line, only while a visitor row exists, so it stays quiet for plain guests.
      if (visitor) {
        logger.debug("Widget prompt decision", {
          visitorId: visitor.id,
          nextCount,
          judgementMatters,
          // The model's own classification and its reasoning — the tuning signal. A stream of
          // "medium, the student has not said what level they are applying at" is a different
          // problem from the model never emitting anything.
          likelihood: concluded?.likelihood ?? null,
          conclusionReason: concluded?.reason ?? null,
          contactStatus: visitor.contact_status,
          conversationState: visitor.conversation_state,
          hasEmail: !!visitor.email,
          summaryStatus: visitor.summary_status,
          // Both counters, because both are now terminal rather than cooldowns: one wrap-up
          // offer per visitor ever, and the contact schedule is derived from its own count.
          // Without these, "decision: none" on a visitor who looks eligible is unexplainable.
          endPromptCount: visitor.end_prompt_count,
          contactPromptCount: visitor.contact_prompt_count,
          // Which background arrays this turn carried, if any — the only way to tell
          // "the model said nothing" from "the write failed" without opening the row.
          profileCaptured: profile ? Object.keys(profile) : null,
          decision: prompted ?? "none",
        });
      }

      // Both are transient events, never persisted `blocks` entries: a block would be written
      // into the message row and replayed on every thread resume from then on, so a visitor
      // who dismissed a card would meet it again on every reopen forever.
      const org = embed?.config.display_name;
      if (prompted === "contact") {
        writeEvent(reply, "contact-prompt", {
          heading: "Want a copy of this conversation?",
          body: `Share your name and email and we'll send you a summary of everything we've covered${org ? ` about ${org}` : ""} — the programs, the details, and what to do next.`,
        });
      } else if (prompted === "ending") {
        writeEvent(reply, "end-prompt", {
          heading: "Shall we wrap up here?",
          // The model's clause, not ours — this is the difference between reading as part of
          // the conversation and reading as a timed pop-up. Null when it classified high but
          // omitted the clause; the card then just drops that sentence.
          covered: concluded?.covered ?? null,
          body: "I can email you a summary of everything we discussed, or we can keep going.",
          email: visitor?.email ?? null,
        });
      }

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
          ...(tenantDb && visitor
            ? { visitor: { db: tenantDb, id: visitor.id, nextCount, prompted } }
            : {}),
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

  /**
   * The visitor's answer to the contact card.
   *
   * Public and unauthenticated like the rest of the widget, so it carries the honeypot and a
   * tighter rate limit than the chat itself — this one writes a person's name and email.
   *
   * Always replies `{ ok: true }`, including for the honeypot and for a visitor whose row
   * cannot be reached. The widget's job here is to stop showing the card; telling it the
   * write failed would only strand the visitor in front of a form they cannot dismiss.
   */
  app.post("/guest/contact", {
    config: { rateLimit: { ...CONTACT_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const input = GuestContactSchema.parse(req.body ?? {});
    if (input.website) return reply.send({ ok: true });

    const config = await embedService.resolveActiveConfig(input.embed_key);
    const db = await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(config));
    if (!db) return reply.send({ ok: true });

    await visitorService.attempt("recordContact", () =>
      visitorService.recordContact(db, {
        visitorKey: guestService.visitorKey(input.fingerprint, input.embed_key),
        embedConfigId: config.id,
        action: input.action,
        name: input.name,
        email: input.email,
      }),
    );

    return reply.send({ ok: true });
  });

  /**
   * The visitor's answer to the end-of-chat offer.
   *
   * This is the ONLY thing that arms a summary email. It replaces a leave beacon and a
   * 30-minute idle sweep, both removed: a summary inferred from silence arrived as though the
   * visitor had finished when they had only stepped away.
   *
   * Always `{ ok: true }`, including when the row cannot be reached — the widget's job here is
   * to put the card away, and telling it the write failed would strand the visitor in front of
   * a choice they cannot dismiss.
   */
  app.post("/guest/conversation-end", {
    config: { rateLimit: { ...CONTACT_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const input = GuestConversationEndSchema.parse(req.body ?? {});
    const config = await embedService.resolveActiveConfig(input.embed_key);
    const db = await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(config));
    if (!db) return reply.send({ ok: true });

    const row = await visitorService.attempt("recordConversationEnd", () =>
      visitorService.recordConversationEnd(db, {
        visitorKey: guestService.visitorKey(input.fingerprint, input.embed_key),
        embedConfigId: config.id,
        action: input.action,
      }),
    );

    // Tells the widget whether a summary is actually coming. A visitor who confirmed without
    // ever giving an address must not be shown "on its way to …".
    return reply.send({ ok: true, summary_queued: row?.summary_status === "pending" });
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
