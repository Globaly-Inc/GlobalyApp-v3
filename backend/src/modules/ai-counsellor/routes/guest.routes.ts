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
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat } from "../lib/gemini-stream.js";
import { buildSystemPrompt } from "../services/prompt.service.js";
import * as rag from "../services/rag.service.js";
import { parseBlocks, parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { judgeConclusion } from "../lib/conclusion-detect.js";
import { extractProfile } from "../lib/profile-extract.js";
import { getProfile, mayKeepEmail, profileBlockFor, retrieveMemories } from "../../institution-memory/index.js";
import {
  applyCollectionRules as applyVisitorCollectionRules,
  visitorCounsellingContext, visitorProfileContext,
} from "../lib/visitor-context.js";
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
    content: string;
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
  await messagesRepo.create({ session_id: sessionId, role: "user", content: turn.content });
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
  if (turn.visitor) {
    const v = turn.visitor;
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

    const nextCount = (visitor?.message_count ?? 0) + 1;

    // Who answers this message — the AI, a staff member, or nobody yet because the visitor is
    // waiting for one. Stale claims go first, so a staff member who went quiet 15 minutes ago
    // hands the chat straight back to the AI on this very message.
    const control = visitor ? takeover.whoAnswers(visitor) : null;
    if (control && visitor && tenantDb) {
      await visitorService.attempt("expireTakeover", () =>
        takeover.expire(tenantDb, visitor.id, { handler: control.expireHandler, request: control.expireRequest }),
      );
    }
    // Before RAG and the reply, so the AI never answers "can I talk to someone?" itself. The regex
    // inside keeps this to the few messages that could be asking.
    const handedOver = !!(control?.answerer === "ai" && visitor && tenantDb && session &&
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

    try {
      // Read history BEFORE persisting this turn, so the model isn't handed the very
      // question it is being asked — the same ordering chat.service relies on.
      const prevMessages = session ? await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT }) : [];
      const history = prevMessages.map((m) => ({
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

      // What this visitor has told the counsellor in earlier turns. Until now the guest path
      // passed `profile: null`, so everything extractProfile wrote to ai_widget_visitors was
      // discarded and the counsellor re-asked for it. Scoped to this visitor_key and read on
      // their own turn only — it is never pooled, embedded or retrieved by similarity.
      // Read once, before the stream: the card decision is made while the socket is still open,
      // and the extractor below needs the same rules. Cached 60s, never throws.
      const rack = embed?.rackInstitutionId ? await getProfile(embed.rackInstitutionId) : null;
      // `degraded` means the rules we hold are DEFAULTS standing in for a read that failed or a
      // row that would not parse — not this institution's choice. Voice and behaviour can ride
      // on defaults; permissions cannot, because the default allow-list is wider than a narrowed
      // one, and a database blip would quietly widen it. Collect nothing until we can read the
      // real rules.
      const collection = rack && !rack.degraded ? rack.profile.collection : null;
      const rulesUnknown = !!rack?.degraded;
      const contactAsk = collection
        ? {
            // AND `email` being keepable, not just the card being switched on. The card asks for
            // an address; an institution that has turned `email` off has said not to keep one,
            // and showing a form whose answer must then be discarded is worse than not asking.
            // Same predicate the submit endpoint uses — see mayKeepEmail.
            enabled: collection.contact_ask.enabled && mayKeepEmail(rack),
            first_at: collection.contact_ask.first_at,
            gap: collection.contact_ask.gap,
          }
        // Do not ask for details we could not store lawfully this turn.
        : rulesUnknown
          ? { ...visitorService.DEFAULT_CONTACT_ASK, enabled: false }
          : visitorService.DEFAULT_CONTACT_ASK;

      // Stored details are filtered through the CURRENT rules before they reach the prompt or
      // the memory query. Gating only the write meant a field switched off yesterday kept being
      // read back from rows written while it was still on — "stop collecting this" has to cover
      // what is already held, not just what arrives next.
      const visible = applyVisitorCollectionRules(visitor, collection ? collection.allowed : rulesUnknown ? [] : undefined);
      // Empty whenever the rules could not be read, by the same reasoning as `keepable` below:
      // an institution's own subjects are neither asked for, kept, nor read back on a turn where
      // we cannot tell which subjects it still has.
      const customFields = collection?.custom ?? [];
      // One indexed read, and only when this institution has defined a subject at all. Its own
      // table rather than a column on the row above, so it is its own query — and its own
      // failure: `attempt` keeps a lagging tenant schema costing the counsellor this memory
      // rather than the turn.
      const customValues = customFields.length && visitor && tenantDb
        ? await visitorService.attempt("customValues", () =>
            visitorService.customValuesFor(tenantDb, visitor.id)) ?? {}
        : {};
      const visitorProfile = visitorProfileContext(visible);
      const visitorContext = visitorCounsellingContext(visible, customFields, customValues);
      const situation = rag.situationText(visitorProfile, visitorContext);
      const [ragOutput, memory, rackProfile] = await Promise.all([
        rag.searchAll({
          query: input.content,
          userId: 0, // ponytail: guests have no userId, profile context will be empty
          jobIds: embed?.jobIds,
          rackInstitutionId: embed?.rackInstitutionId,
          pinnedCourseIds: rag.pinnedCourseIdsFrom(prevMessages),
          onTrace: trace,
        }),
        embed?.rackInstitutionId
          ? retrieveMemories({
              institutionId: embed.rackInstitutionId,
              institutionName: embed.config.display_name,
              query: input.content,
              // Situation-bound guidance could never match before: the query carried the
              // message and nothing about who was asking.
              situation,
              onTrace: trace,
            })
          : null,
        // The Rack's configuration half — voice, behaviour, what may be collected. Cached 60s
        // and never throws, so it rides the same Promise.all rather than adding a round trip.
        embed?.rackInstitutionId ? profileBlockFor(embed.rackInstitutionId) : "",
      ]);

      if (ragOutput.sources.length) {
        writeEvent(reply, "sources", ragOutput.sources);
      }

      // Same money guard as chat.service: widget visitors are the audience it exists for.
      const noMoneyData = rag.shouldWithholdMoney(input.content, ragOutput.moneyTopics);
      if (noMoneyData) trace(`Money question, no evidence for ${rag.moneyTopicsOf(input.content).join("/")}: answer withheld`);

      const system = buildSystemPrompt({
        profile: visitorProfile,
        counsellingContext: visitorContext,
        ragContext: ragOutput.contextText,
        // A returning visitor mid-thread must not get the opening greeting again.
        isFirstMessage: history.length === 0,
        embedConfig: embed?.config,
        rackProfile,
        institutionGuidance: memory?.text,
        noMoneyData,
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
      // Same rules object read before the stream — what may be asked for, and what may be kept.
      //
      // `sensitive` is subtracted, not just announced to the model. The portal's own words for
      // it are "use it to answer, never record it", and until this line the extractor was still
      // handed the field and still wrote it: `sensitive` is a subset of `allowed`, so the stored
      // rule said one thing and the storage did another. The model can still USE it — it is in
      // the transcript either way — but nothing asks for it and nothing keeps it.
      const keepable = collection
        ? collection.allowed.filter((f) => !collection.sensitive.includes(f))
        // Empty list, not `undefined`: undefined means "no institution, use the built-in set",
        // while an unreadable rule set means "we do not know what we may keep" — so keep nothing.
        : rulesUnknown ? [] : undefined;
      const { profile, contact, custom } = visitor && tenantDb
        ? await extractProfile(history, input.content, keepable, customFields)
        : { profile: null, contact: null, custom: null };

      if (profile && visitor && tenantDb) {
        await visitorService.attempt("recordProfile", () =>
          visitorService.recordProfile(tenantDb, visitor.id, profile),
        );
      }

      // The institution's own subjects. Its own statement for the same reason as the two around
      // it: one jsonb column, one cleaner, and a lagging tenant schema costs this write alone.
      if (custom && visitor && tenantDb) {
        await visitorService.attempt("recordCustom", () =>
          visitorService.recordCustom(tenantDb, visitor.id, custom),
        );
      }

      // Details they gave in prose rather than in the card. An email settles the card for good
      // and arms the summary; a name alone is stored and the card may still ask later, with
      // their name already known. Separate statement from recordProfile for the same reason
      // that one is separate from recordTurn: a lagging tenant schema must fail one write, not
      // the turn.
      // Every decision below reads `current`, not `visitor`: an address volunteered in prose
      // settles the contact card on this very turn, and deciding off the row we loaded before
      // the write asks for the name and email the visitor just handed over. The update returns
      // the row it wrote for exactly this; a failed or no-op write leaves the loaded one.
      let current = visitor;
      if (contact && visitor && tenantDb && visitorKey && embed) {
        current = await visitorService.attempt("recordVolunteeredContact", () =>
          visitorService.recordVolunteeredContact(tenantDb, {
            visitorKey, embedConfigId: embed.config.id, ...contact,
          }),
        ) ?? visitor;
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
      const judgementMatters = !!embed && !!current && !forceEnd &&
        visitorService.decidePrompt(current, nextCount, true, contactAsk) !==
          visitorService.decidePrompt(current, nextCount, false, contactAsk);

      // Asked as its own call, over the transcript, rather than as a block the counsellor was
      // supposed to append to its own reply. See conclusion-detect for why that never fired.
      const concluded = judgementMatters && current
        ? await judgeConclusion(history, input.content, cleanText)
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
          memoryIds: memory?.ids,
          usage: result.usage,
          ...(tenantDb && visitor
            ? { visitor: { db: tenantDb, id: visitor.id, nextCount, prompted } }
            : {}),
        })
          // The chat's staff summary follows every turn, once the turn is stored.
          .then(() => (embed
            ? refreshChatSummary(session.id, embed.config.display_name, tenantDb && visitor ? { db: tenantDb, visitorId: visitor.id } : undefined)
            : undefined))
          .catch((err) => logger.error("Failed to persist visitor turn", { err: String(err) }));
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
    if (!session) return reply.send({ session_id: null, messages: [], agent_name: null, waiting: false });

    const rows = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
    // Staff attachments are private objects; sign them per read, like enquiry chat.
    const messages = await Promise.all(rows.map(async (m) =>
      m.role === "agent"
        ? { ...m, attachments: await mediaService.withViewUrls(m.attachments as mediaService.MessageAttachment[]) }
        : m,
    ));
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
