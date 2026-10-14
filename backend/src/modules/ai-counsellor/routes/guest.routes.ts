import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import {
  GuestContactSchema,
  GuestConversationEndSchema,
  GuestFeedbackSchema,
  MessageIdParamSchema,
  GuestMessageSchema,
  GuestMigrateSchema,
  GuestRatingSchema,
  GuestSessionQuerySchema,
} from "../schemas/chat.schema.js";
import * as guestService from "../services/guest.service.js";
import * as embedService from "../services/embed.service.js";
import * as visitorService from "../services/visitor.service.js";
import * as takeover from "../services/takeover.service.js";
import * as mediaService from "../../enquiries/services/message-media.service.js";
import { judgeWantsHuman } from "../lib/handover-detect.js";
import { refreshChatSummary } from "../services/chat-summaries.service.js";
import * as embedRepo from "../repositories/embed.repository.js";
import * as knowledgeRepo from "../repositories/knowledge.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { withInstitutionMedia } from "../services/chat.service.js";
import { judgeConclusion } from "../lib/conclusion-detect.js";
import { getProfile, mayKeepEmail } from "../../institution-memory/index.js";
import { captureVisitorDetails, generateVisitorReply, loadVisitorRules } from "../services/visitor-reply.service.js";
import * as learningSignals from "../services/learning-signals.service.js";
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

/** Fixed copy, its own message — never appended to model text. */
const HANDOVER_LINE =
  "I've asked our admissions team to join this chat. Someone will reply here as soon as they can — you can keep typing in the meantime.";

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
    /** Null on a resume turn: the questions it answers are already stored. */
    content: string | null;
    /** Null while a person handles the chat or is being waited for: the visitor's row only. */
    answer: string | null;
    sources: unknown[];
    cards: unknown[];
    chips: unknown[];
    blocks: unknown[];
    /** Institution memories that shaped the answer — feedback learns against these. */
    memoryIds?: string[];
    /** streamChat reports camelCase; the messages table stores snake_case. */
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    /** Absent when the owner has no provisioned schema — the chat still works, see tenantDbFor. */
    visitor?: { db: Knex; id: number; nextCount: number; prompted: visitorService.PromptKind | null };
  },
) {
  if (turn.content !== null) await messagesRepo.create({ session_id: sessionId, role: "user", content: turn.content });
  if (turn.answer !== null) await messagesRepo.create({
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
    memory_ids: turn.memoryIds,
  });
  await sessionsRepo.incrementMessageCount(sessionId);

  // Separately guarded: a tenant schema that has not taken the ai_widget_visitors migration
  // yet must not lose the transcript that was just written above it.
  if (turn.visitor) await recordVisitorTurn(turn.visitor, sessionId);
}

/**
 * The visitor row's own bookkeeping for a turn whose transcript is already stored. Split out
 * because the widget's stream persists the two messages before it unlocks the composer, but
 * `prompted` is only known two model calls later.
 */
async function recordVisitorTurn(
  v: { db: Knex; id: number; nextCount: number; prompted: visitorService.PromptKind | null },
  sessionId: number,
) {
  await visitorService.attempt("recordTurn", () =>
    visitorService.recordTurn(v.db, v.id, {
      prompted: v.prompted,
      nextCount: v.nextCount,
      sessionId,
    }),
  );
  // Its own statement: a schema behind 20261001_001 must not lose the turn count above.
  await visitorService.attempt("bumpUnread", () => takeover.bumpUnread(v.db, v.id));
}

/** Public: anonymous chat — plain guests (1 reply, signup wall) and embed-widget visitors. */
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ");

/**
 * Is this the widget's first intake turn — the one that withholds courses and asks the level?
 *
 * Widgets only. A plain guest (no embed key) is STATELESS: `guestService` gives them no session,
 * so `history.length` is 0 on every message they ever send, and they are capped at one reply by
 * the signup gate. Discovery there would spend that single reply asking a question they are not
 * allowed to answer, and they would never see a course (Greptile).
 */
export function isDiscoveryTurn(hasEmbed: boolean, historyLength: number, asked = ""): boolean {
  if (!hasEmbed || historyLength !== 0) return false;
  // What they OPENED with decides it. Discovery exists to stop a course dump, so a visitor who
  // asked where the campus is — or who already said what level they want — has nothing left for
  // the level question to do: it would ignore their question and interrogate them first.
  return !asksAnswerableTopic(asked) && !statedLevel(asked);
}

/**
 * Did they open with something we can simply ANSWER, rather than a course hunt?
 *
 * A denylist and not a "is this about courses" allowlist on purpose: a course hunt is shapeless
 * ("hi", "what do you offer?", "I want to study abroad") and cannot be matched, while the handful
 * of things a visitor asks a widget INSTEAD of shopping — where you are, what it costs, how to
 * apply — is a short, nameable list. Anything unmatched still gets discovery, which is the safe
 * side of the line: the worst case is the question it was already asking.
 *
 * ponytail: plain word match, no intent model. A mixed opener ("what courses, and how much?") is
 * read as the concrete question and skips discovery — they asked something answerable, so answer it.
 */
export function asksAnswerableTopic(asked: string): boolean {
  return /\b(where|located|location|campus|campuses|branch|branches|office|offices|address|contact|phone|email|fee|fees|cost|costs|price|prices|tuition|scholarship|scholarships|funding|apply|application|admission|admissions|enrol|enroll|deadline|deadlines|intake|intakes|visa|accommodation|hostel|housing|ranking|ranked|accredited|accreditation)\b/
    .test(norm(asked));
}

/** The study level the visitor just named, in their own words, or null if they named none.
 *  Only meaningful as the answer to the level question — a message about anything else returns
 *  null, which puts the turn back on the normal path with its courses. */
export function statedLevel(asked: string): string | null {
  const text = norm(asked);
  // A named qualification keeps its own name: folding "certificate" and "diploma" into the generic
  // bucket threw away the one word that matches the catalogue, which stores Certificate, Diploma,
  // Graduate Certificate and Advanced Diploma as distinct levels (Greptile). Only a visitor who
  // says something genuinely broad — "short course", "training" — gets the broad bucket, and the
  // prompt expands THAT across all of them.
  const LEVELS: Array<[RegExp, string]> = [
    [/\b(phd|doctoral|doctorate)\b/, "PhD"],
    [/\b(masters?|msc|ma|mba|meng|postgraduate)\b/, "Master's"],
    [/\b(bachelors?|undergraduate|bsc|beng|ba)\b/, "Bachelor's"],
    [/\bcertificates?\b/, "Certificate"],
    [/\bdiplomas?\b/, "Diploma"],
    [/\b(short courses?|trainings?|professional training)\b/, "Short course"],
  ];
  return LEVELS.find(([re]) => re.test(text))?.[1] ?? null;
}

/** Has the visitor already named one of the subject areas we teach? Then the stream question is
 *  answered and asking it would be the interrogation discovery exists to avoid. Matches the whole
 *  area ("business and management") or any distinctive word of it ("engineering"). */
export function namesSubject(asked: string, catalogue: readonly knowledgeRepo.CatalogueShapeRow[]): boolean {
  const text = ` ${norm(asked)} `;
  const SKIP = new Set(["and", "the", "of", "for", "with", "other", "general", "studies", "sciences", "science"]);
  return catalogue.some((row) => {
    const area = norm(row.subject_area ?? "").trim();
    if (!area) return false;
    if (text.includes(` ${area} `)) return true;
    return area.split(" ").some((word) => word.length >= 5 && !SKIP.has(word) && text.includes(` ${word} `));
  });
}

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

    let visitor = embed && tenantDb && session && visitorKey
      ? await visitorService.attempt("resolveVisitor", () =>
          visitorService.resolveVisitor(tenantDb, {
            visitorKey,
            embedConfigId: embed.config.id,
            sessionId: session.id,
          }),
        )
      : null;

    // A session other than the one the visitor row last recorded means their previous chat
    // ended and this message opened a new one: reset the per-chat state before deciding anything.
    if (visitor && tenantDb && session && visitor.session_id != null && visitor.session_id !== session.id) {
      const v = visitor;
      const fresh = await visitorService.attempt("startNewChat", () => visitorService.startNewChat(tenantDb, v.id));
      if (fresh) visitor = fresh;
    }

    // A resume carries no new visitor message, so it doesn't count as one.
    const nextCount = (visitor?.message_count ?? 0) + (input.resume ? 0 : 1);

    // Who answers this message — the AI, a staff member, or nobody yet because the visitor is
    // waiting for one. Stale claims go first, so a staff member who went quiet 15 minutes ago
    // hands the chat straight back to the AI on this very message.
    const control = visitor ? takeover.whoAnswers(visitor) : null;
    if (control && visitor && tenantDb) {
      await visitorService.attempt("expireTakeover", () =>
        takeover.expire(tenantDb, visitor.id, { handler: control.expireHandler, request: control.expireRequest }),
      );
    }
    // The widget asks for a resume when it sees the chat back with the AI after a person had it.
    // Only the AI answers one; while someone still holds the chat there is nothing to do.
    if (input.resume && control?.answerer !== "ai") {
      initSSE(reply);
      writeDone(reply);
      return;
    }

    // Before RAG and the reply, so the AI never answers "can I talk to someone?" itself. The regex
    // inside keeps this to the few messages that could be asking.
    const handedOver = !!(!input.resume && control?.answerer === "ai" && visitor && tenantDb && session &&
      (await judgeWantsHuman(input.content)) &&
      (await visitorService.attempt("requestHandover", () => takeover.requestHandover(tenantDb, visitor.id))));

    if (control && visitor && tenantDb && session && (control.answerer !== "ai" || handedOver)) {
      // No RAG, no model, no credits. The visitor's message is stored for the Inbox to show, and
      // the widget is told who it is waiting on.
      initSSE(reply);
      try {
        if (handedOver) {
          writeData(reply, { choices: [{ delta: { content: HANDOVER_LINE } }] });
          // Nobody watches the Inbox all day, and there is no in-app notification yet. Not
          // awaited: the visitor's reply must not wait on a mail server.
          takeover.notifyHandoverRequest(embed!.config, visitor, input.content)
            .catch((err) => logger.warn("Handover email not sent", { visitorId: visitor.id, err: err instanceof Error ? err.message : String(err) }));
        }
        await persistVisitorTurn(session.id, {
          content: input.content,
          answer: handedOver ? HANDOVER_LINE : null,
          sources: [], cards: [], chips: [], blocks: [],
          visitor: { db: tenantDb, id: visitor.id, nextCount, prompted: null },
        });
        void refreshChatSummary(session.id, embed?.config.display_name ?? null, { db: tenantDb, visitorId: visitor.id });
        if (control.answerer === "agent") writeEvent(reply, "handoff", { agent_name: visitor.handled_by_name ?? null });
        else writeEvent(reply, "handover", {});
      } catch (err) {
        logger.error("Failed to persist a handed-over visitor message", { err: err instanceof Error ? err.message : String(err) });
        writeData(reply, { choices: [{ delta: { content: "I'm sorry, something went wrong. Please try again." } }] });
      }
      writeDone(reply);
      return;
    }

    initSSE(reply);

    // Set when this resume claims questions; released if no reply ends up saved for them.
    let claim: { sessionId: number; through: number; previous: number | null } | null = null;
    const releaseClaim = () => claim
      ? sessionsRepo.releaseAnsweredThrough(claim.sessionId, claim.through, claim.previous)
      : Promise.resolve();

    try {
      // Read history BEFORE persisting this turn, so the model isn't handed the very
      // question it is being asked — the same ordering chat.service relies on.
      const prevMessages = session ? await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT }) : [];
      // Questions left unanswered while a person had the chat are answered with this turn: they
      // leave the history and join the question, so the AI addresses them instead of only the
      // newest message. A resume turn is exactly those questions and nothing else.
      const answeredThrough = session?.answered_through_message_id ?? null;
      let pending = takeover.unansweredTail(prevMessages, answeredThrough);
      // The whole window is unanswered: the visitor sent more than it holds while a person had the
      // chat. Read further back for the questions (only); the model's history stays the window.
      // ponytail: 200 messages, the transcript endpoint's own cap.
      if (session && pending.cut === 0 && prevMessages.length === HISTORY_LIMIT) {
        const { questions, lastId } = takeover.unansweredTail(await messagesRepo.findBySession(session.id, { limit: 200 }), answeredThrough);
        pending = { cut: 0, questions, lastId };
      }
      // A resume claims the questions before answering, so a second tab or a reload mid-reply
      // finds them taken and stops here.
      if (input.resume && (!session || pending.lastId == null || !(await sessionsRepo.claimAnsweredThrough(session.id, pending.lastId)))) {
        writeDone(reply);
        return;
      }
      if (input.resume && session && pending.lastId != null) {
        claim = { sessionId: session.id, through: pending.lastId, previous: answeredThrough };
      }
      const asked = pending.questions.length
        ? [...pending.questions, ...(input.resume ? [] : [input.content])].join("\n\n")
        : input.content;
      const history = prevMessages.slice(0, pending.cut).map((m) => ({
        // Staff replies are the institution's side too, so after Resume AI the model reads them as its own.
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        parts: [{ text: m.content }],
      }));

      // Guest-meta event
      writeEvent(reply, "guest-meta", {
        replies_remaining: 0,
        fingerprint_hash: fingerprintHash,
        session_id: session?.id ?? null,
      });

      // RAG search (no profile context for guests), beside the institution's own counselling
      // memory — the same pairing as chat.service, and the memory call never throws.
      const trace = (step: string) => writeEvent(reply, "trace", { step });

      // Two discovery turns, then courses. Turn 1 asks the LEVEL, turn 2 the STREAM, and both run
      // with course retrieval switched off — instructions alone don't stop a recommendation when
      // CONTEXT is full of matching courses. What the catalogue actually holds (levels, subject
      // areas, counts) is handed to the model instead, so neither question invents an option.
      //
      // Turn 2 is skipped when the visitor has already named a subject we teach: they answered the
      // question before it was asked, and asking it anyway is the interrogation this is meant to
      // avoid. `history.length === 2` is exactly one prior exchange — their second message.
      //
      // No exemption for a visitor we have already met. A stored `study_preference` is one course
      // this fingerprint once discussed, not what they came back for, and skipping discovery on it
      // meant anyone who had ever used the widget — the owner testing it, most of all — kept getting
      // the catalogue dump this exists to stop. What we hold still reaches the model through the
      // visitor context, so turn 1 asks a sharper question rather than the same one twice.
      //
      // Computed HERE and not inside generateVisitorReply: the intake asks its question through a
      // quick_replies block, and the messaging channels strip blocks before sending — on WhatsApp
      // the visitor would get a reply with the question missing. This is the widget's flow, so the
      // widget's own route decides it, and the shared helper simply honours what it is given.
      const discoveryTurn = isDiscoveryTurn(!!embed, history.length, asked);
      const catalogue = embed?.jobIds?.length && history.length <= 2
        ? await visitorService.attempt("catalogueShape", () => knowledgeRepo.listCatalogueShape(embed.jobIds!)) ?? []
        : [];
      // Their stated level is their own words — the prompt matches it to the catalogue's free-text
      // levels through the same synonym table course search uses.
      // `history.length <= 2` is their first or second message: an opener that already named the
      // level skipped discovery, so the subject question is the one still worth asking and it can
      // land a turn early. An answerable question outranks both — "how much is a master's?" wants
      // the fee, not another question.
      const streamTurn = !discoveryTurn && history.length <= 2 && !!embed
        && !asksAnswerableTopic(asked) && !namesSubject(asked, catalogue)
        ? statedLevel(asked)
        : null;

      // What may be asked for, read back and kept — the organisation's collection rules, read once
      // for the whole turn. The reply itself (RAG, prompt, model) is the shared visitor reply, the
      // same one WhatsApp, Instagram and Facebook use, so the surfaces cannot drift apart.
      const rules = await loadVisitorRules(embed);
      const { contactAsk } = rules;
      const { result, cleanText, cards, chips, blocks, sources, memory, visitorLocation } = await generateVisitorReply({
        embed, rules, tenantDb, visitor, prevMessages, history, asked,
        discoveryTurn, streamTurn, catalogue,
        headers: req.headers,
        onTrace: trace,
        onSources: (sources) => writeEvent(reply, "sources", sources),
        onChunk: (chunk) => writeData(reply, { choices: [{ delta: { content: chunk } }] }),
      });

      if (cards.length) writeEvent(reply, "cards", cards);
      if (chips.length) writeEvent(reply, "chips", chips);
      if (blocks.length) writeEvent(reply, "blocks", blocks);

      // The reply itself is complete HERE. Everything below — the profile extraction and the
      // conclusion judgement — is two more model calls whose only output is an optional card,
      // and the widget locks its composer until the stream closes. Without this event the
      // visitor sits in front of a finished answer and a dead input box for both of them.
      //
      // So the exchange is stored BEFORE the composer unlocks: a visitor who taps a quick reply
      // the instant the answer lands would otherwise open a turn whose history window is missing
      // the one they just read, and get asked again what they just answered. Two inserts, not the
      // tail — the visitor row's prompt bookkeeping needs `prompted`, which is decided below.
      let stored = false;
      if (session) {
        try {
          await persistVisitorTurn(session.id, {
            content: input.resume ? null : input.content,
            answer: cleanText,
            sources,
            cards,
            chips,
            blocks,
            memoryIds: memory?.ids,
            usage: result.usage,
          });
          stored = true;
        } catch (err) {
          // The reply never got stored, so its questions are still owed.
          await releaseClaim();
          logger.error("Failed to persist visitor turn", { err: String(err) });
        }
      }

      writeEvent(reply, "reply-done", {});

      // Anything the visitor told us about themselves this turn. Awaited rather than fired and
      // forgotten: an orphaned promise would outlive the request and write through a tenant
      // connection nobody holds open. `current` is the row as written, so the decisions below see
      // an address volunteered on this very turn.
      const { profile, current } = await captureVisitorDetails({ embed, rules, tenantDb, visitor, visitorKey, history, asked });

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
      const judgementMatters = !!embed && !!current && !forceEnd &&
        visitorService.decidePrompt(current, nextCount, true, contactAsk) !==
          visitorService.decidePrompt(current, nextCount, false, contactAsk);

      // Asked as its own call, over the transcript, rather than as a block the counsellor was
      // supposed to append to its own reply. See conclusion-detect for why that never fired.
      const concluded = judgementMatters && current
        ? await judgeConclusion(history, asked, cleanText)
        : null;

      const prompted = embed && current
        ? visitorService.decidePrompt(current, nextCount, forceEnd || concluded?.likelihood === "high", contactAsk)
        : null;

      // Why no card appeared is otherwise unanswerable: a missing visitor row, a gate that was
      // never open, a model that declined to signal and a cooldown all look identical from the
      // outside. One line, only while a visitor row exists, so it stays quiet for plain guests.
      if (current) {
        logger.debug("Widget prompt decision", {
          visitorId: current.id,
          nextCount,
          judgementMatters,
          // The model's own classification and its reasoning — the tuning signal. A stream of
          // "medium, the student has not said what level they are applying at" is a different
          // problem from the model never emitting anything.
          likelihood: concluded?.likelihood ?? null,
          conclusionReason: concluded?.reason ?? null,
          contactStatus: current.contact_status,
          conversationState: current.conversation_state,
          hasEmail: !!current.email,
          summaryStatus: current.summary_status,
          // Both counters, because both are now terminal rather than cooldowns: one wrap-up
          // offer per visitor ever, and the contact schedule is derived from its own count.
          // Without these, "decision: none" on a visitor who looks eligible is unexplainable.
          endPromptCount: current.end_prompt_count,
          contactPromptCount: current.contact_prompt_count,
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
          heading: "Want a summary of this conversation?",
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
          email: current?.email ?? null,
          // An optional in-person next step, at the one moment it is a next step rather than an
          // interruption. Null unless the visitor's location is specific enough to mean it (see
          // branchInvite) — including for students heading abroad, who are offered the owner's
          // office in THEIR country, which is the one they can actually walk into.
          //
          // Not repeated: end_prompt_count is terminal, so this card is shown once per visitor
          // ever, whether they accept it or keep chatting.
          branch: visitorLocation?.invite ?? null,
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

      // The transcript is already stored; what is left is the visitor row's bookkeeping (it needed
      // `prompted`) and the staff summary. Fire-and-forget — the stream is closed.
      //
      // ponytail: the prompt counters this writes still land after the composer unlocked, so a
      // visitor who answers within those two model calls can be shown one card twice. Serialise
      // turns per session if that is ever seen; the transcript, which is what a turn reads, is safe.
      const vis = visitor;
      if (session && stored) {
        const bookkeeping = tenantDb && vis
          ? recordVisitorTurn({ db: tenantDb, id: vis.id, nextCount, prompted }, session.id)
          : Promise.resolve();
        bookkeeping
          // The chat's staff summary follows every turn, once the turn is stored.
          .then(() => (embed
            ? refreshChatSummary(session.id, embed.config.display_name, tenantDb && vis ? { db: tenantDb, visitorId: vis.id } : undefined)
            : undefined))
          .catch((err) => logger.error("Visitor turn bookkeeping failed", { err: String(err) }));
      } else if (!session) {
        guestService.createGuestSession({
          fingerprintHash,
          ipHash,
          messageContent: input.content,
          responseContent: cleanText,
          responseSources: sources,
          embedConfigId: embed?.config.id,
        }).catch((err) => logger.error("Failed to persist guest session", { err: String(err) }));
      }
    } catch (err) {
      logger.error("Guest stream error", { err: err instanceof Error ? err.message : String(err) });
      await releaseClaim();
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
    if (!session) return reply.send({ session_id: null, messages: [], agent_name: null, waiting: false });

    const rows = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
    // Staff attachments are private objects; sign them per read, like enquiry chat.
    // Cards re-enriched on read, like the app chat: logos are signed URLs that expire, and cards
    // saved before enrichment carried none. One batch for the whole thread, since this is polled.
    type Card = Parameters<typeof withInstitutionMedia>[0][number];
    const stored = rows.map((m) => (Array.isArray(m.cards) ? (m.cards as Card[]) : []));
    const enriched = await withInstitutionMedia(stored.flat());
    let at = 0;
    const messages = await Promise.all(rows.map(async (m, i) => {
      const cards = stored[i].length ? enriched.slice(at, (at += stored[i].length)) : m.cards;
      return m.role === "agent"
        ? { ...m, cards, attachments: await mediaService.withViewUrls(m.attachments as mediaService.MessageAttachment[]) }
        : { ...m, cards };
    }));
    // Polled by the widget every few seconds, so the header and the waiting card follow the Inbox.
    const db = await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(config));
    const state = db
      ? await visitorService.attempt("widgetState", () =>
          takeover.widgetState(db, { visitorKey: guestService.visitorKey(query.fingerprint, query.embed_key), embedConfigId: config.id }))
      : null;
    return reply.send({ session_id: session.id, messages, agent_name: state?.agent_name ?? null, waiting: state?.waiting ?? false });
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

    // The WRITE end of the same rule. Suppressing the card stops us asking; it does not stop a
    // POST arriving anyway — a stale page still showing the form, or anyone with the embed key.
    // A privacy guarantee enforced only where we ask is the defect this module keeps making, so
    // the storage checks for itself.
    //
    // Unreadable rules (`degraded`) store nothing either, matching the message path: "we do not
    // know what we may keep" is not permission. Still `{ ok: true }` — the visitor gets no
    // signal about another tenant's settings.
    //
    // SKIP IS EXEMPT, and the exemption is the whole point of the gate being here rather than
    // around the endpoint. A skip stores no contact details at all: recordContact's skip branch
    // writes `contact_status` and the cooldown anchor only, ignoring name/email even when a
    // client sends them. Gating it dropped the dismissal, so `contact_prompted_at_count` never
    // advanced and the card came back — a visitor left unable to get rid of a form, caused by a
    // privacy check applied to the one action that stores nothing.
    // Guarded by tests/widget-visitor-list §8: if the skip branch ever starts writing a contact
    // column, this exemption becomes a hole and that assertion goes red first.
    if (input.action !== "skip") {
      const rack = config.institution_id != null ? await getProfile(Number(config.institution_id)) : null;
      if (!mayKeepEmail(rack)) return reply.send({ ok: true });
    }

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
  // POST /guest/messages/:id/feedback — a widget visitor's thumbs, keyed on (embed_key,
  // fingerprint) like everything else they own. The fingerprint is client-supplied, so the
  // learning side counts one vote per actor and never lets votes retire an admin rule.
  app.post("/guest/messages/:id/feedback", {
    config: { rateLimit: { ...CONTACT_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const { id } = MessageIdParamSchema.parse(req.params);
    const input = GuestFeedbackSchema.parse(req.body ?? {});
    const config = await embedService.resolveActiveConfig(input.embed_key);
    await learningSignals.recordStudentFeedback(id, input.feedback, {
      visitorKey: guestService.visitorKey(input.fingerprint, input.embed_key),
      embedConfigId: config.id,
    });
    return reply.send({ ok: true });
  });

  /**
   * The end-of-chat rating, after the visitor ended the chat. Public like the rest, so it takes
   * the tight limit, and it is only accepted on an ended chat (see takeover.recordRating).
   */
  app.post("/guest/rating", {
    config: { rateLimit: { ...CONTACT_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const input = GuestRatingSchema.parse(req.body ?? {});
    const config = await embedService.resolveActiveConfig(input.embed_key);
    const db = await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(config));
    if (db) {
      await visitorService.attempt("recordRating", () =>
        takeover.recordRating(db, {
          visitorKey: guestService.visitorKey(input.fingerprint, input.embed_key),
          embedConfigId: config.id,
          rating: input.rating,
          comment: input.comment,
        }),
      );
    }
    return reply.code(204).send();
  });

  app.post("/guest/conversation-end", {
    config: { rateLimit: { ...CONTACT_RATE, keyGenerator: embedRateKey } },
  }, async (req, reply) => {
    const input = GuestConversationEndSchema.parse(req.body ?? {});
    const config = await embedService.resolveActiveConfig(input.embed_key);
    const db = await visitorService.attempt("tenantDbFor", () => visitorService.tenantDbFor(config));
    if (!db) return reply.send({ ok: true });

    const visitorKey = guestService.visitorKey(input.fingerprint, input.embed_key);
    const row = await visitorService.attempt("recordConversationEnd", () =>
      visitorService.recordConversationEnd(db, { visitorKey, embedConfigId: config.id, action: input.action }),
    );

    // The finished chat is the third learning signal, read BEFORE the chat is closed (it looks up
    // the open chat). Then the chat closes, so the visitor's next visit starts a fresh one.
    if (input.action === "end") {
      await learningSignals.onConversationEnd(config, visitorKey)
        .catch((err) => logger.warn("Conversation-end learning not queued", { configId: config.id, err: String(err) }));
      await sessionsRepo.endVisitorSession(visitorKey, config.id)
        .catch((err) => logger.warn("Chat not closed", { configId: config.id, err: String(err) }));
    }

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
