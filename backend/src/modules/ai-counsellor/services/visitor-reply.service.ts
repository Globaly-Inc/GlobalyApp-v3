// One AI reply to a visitor, shared by every surface that talks to the public: the website widget
// (guest.routes, streamed over SSE) and the messaging channels — WhatsApp, Instagram, Facebook —
// (modules/channels, sent through Zernio).
//
// Extracted from guest.routes so the two cannot drift: the same rules decide what the AI may read
// back about a visitor, what it retrieves, and what it may keep afterwards. Behaviour here is the
// widget's, unchanged; the channels only add a `surfaceNote` and skip the widget-only extras
// (streaming, branch hint from Cloudflare headers).

import type { IncomingHttpHeaders } from "node:http";
import type { Knex } from "knex";
import type { EmbedContext } from "./embed.service.js";
import * as visitorService from "./visitor.service.js";
import type { MessageRow } from "../repositories/messages.repository.js";
import type { CatalogueShapeRow } from "../repositories/knowledge.repository.js";
import { asksAboutPlace, mapLocationsFor } from "../lib/visitor-location.js";
import { streamChat, type StreamChatOpts } from "../lib/gemini-stream.js";
import { buildSystemPrompt } from "./prompt.service.js";
import * as rag from "./rag.service.js";
import { parseBlocks, parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { withInstitutionMedia } from "./chat.service.js";
import { extractProfile } from "../lib/profile-extract.js";
import { getProfile, mayKeepEmail, profileBlockFor, retrieveMemories } from "../../institution-memory/index.js";
import {
  applyCollectionRules as applyVisitorCollectionRules,
  visitorCounsellingContext, visitorProfileContext,
} from "../lib/visitor-context.js";

export type ChatHistory = StreamChatOpts["history"];

type Rack = Awaited<ReturnType<typeof getProfile>>;
type Collection = NonNullable<Rack>["profile"]["collection"];

/** What this organisation lets the AI ask for, read back and keep — read once per turn. */
export interface VisitorRules {
  rack: Rack | null;
  collection: Collection | null;
  /** The rules we hold are DEFAULTS standing in for a failed read: collect nothing. */
  rulesUnknown: boolean;
  contactAsk: visitorService.ContactAskRules;
  customFields: Collection["custom"];
  /** Fields extractProfile may keep: `sensitive` is subtracted — "use it to answer, never record it". */
  keepable: string[] | undefined;
}

export async function loadVisitorRules(embed: EmbedContext | undefined): Promise<VisitorRules> {
  // Cached 60s, never throws. A plain guest (no widget) has no rules: the built-in set applies.
  const rack = embed?.rackInstitutionId ? await getProfile(embed.rackInstitutionId) : null;
  // `degraded`: voice and behaviour can ride on defaults; permissions cannot, because the default
  // allow-list is wider than a narrowed one and a database blip would quietly widen it.
  const collection = rack && !rack.degraded ? rack.profile.collection : null;
  const rulesUnknown = !!rack?.degraded;
  const contactAsk = collection
    ? {
        // AND `email` being keepable: an institution that has turned `email` off has said not to
        // keep one. Same predicate the contact submit endpoint uses — see mayKeepEmail.
        enabled: collection.contact_ask.enabled && mayKeepEmail(rack),
        first_at: collection.contact_ask.first_at,
        gap: collection.contact_ask.gap,
      }
    : rulesUnknown
      ? { ...visitorService.DEFAULT_CONTACT_ASK, enabled: false }
      : visitorService.DEFAULT_CONTACT_ASK;
  const keepable = collection
    ? collection.allowed.filter((f) => !collection.sensitive.includes(f))
    // Empty, not undefined: "we do not know what we may keep" — so keep nothing.
    : rulesUnknown ? [] : undefined;
  return { rack, collection, rulesUnknown, contactAsk, customFields: collection?.custom ?? [], keepable };
}

export interface VisitorReplyInput {
  /** Undefined for a plain guest on the public site (no widget). */
  embed: EmbedContext | undefined;
  rules: VisitorRules;
  tenantDb: Knex | null;
  visitor: visitorService.VisitorRow | null;
  /** History window read BEFORE this turn was stored. */
  prevMessages: MessageRow[];
  history: ChatHistory;
  /** This turn's question, already folded with any unanswered questions. */
  asked: string;
  /** Widget only: Cloudflare location → nearest branch. */
  headers?: IncomingHttpHeaders | null;
  /** Widget only: the intake turns that withhold courses — turn 1 asks the level, turn 2 the
   *  stream. Decided by the caller, not here, because the question is asked through a
   *  quick_replies block and the messaging channels strip blocks before sending: on WhatsApp the
   *  visitor would get the reply with its question missing. Absent means the ordinary path. */
  discoveryTurn?: boolean;
  /** The level the visitor named, when this is the stream turn. */
  streamTurn?: string | null;
  /** Levels and subject areas this catalogue actually holds — the discovery turns have no course
   *  data, so without it the model invents the options it offers. */
  catalogue?: CatalogueShapeRow[];
  /** Appended to the system prompt, e.g. "you are replying on WhatsApp: plain text". */
  surfaceNote?: string;
  onChunk?: (text: string) => void;
  onTrace?: (step: string) => void;
  onSources?: (sources: unknown[]) => void;
}

export async function generateVisitorReply(input: VisitorReplyInput) {
  const { embed, rules, tenantDb, visitor, prevMessages, history, asked } = input;
  const trace = input.onTrace ?? (() => {});

  // Stored details are filtered through the CURRENT rules before they reach the prompt or the
  // memory query: "stop collecting this" has to cover what is already held, not just what arrives.
  const visible = applyVisitorCollectionRules(visitor, rules.collection ? rules.collection.allowed : rules.rulesUnknown ? [] : undefined);
  const customValues = rules.customFields.length && visitor && tenantDb
    ? await visitorService.attempt("customValues", () => visitorService.customValuesFor(tenantDb, visitor.id)) ?? {}
    : {};
  const visitorProfile = visitorProfileContext(visible);
  // `asked` is what infers the journey stage — see stageFor. Platform sessions get their stage
  // from the model through update_student_context; a visitor has no tool loop to write one.
  const visitorContext = visitorCounsellingContext(visible, rules.customFields, customValues, asked);
  const situation = rag.situationText(visitorProfile, visitorContext);
  const priorQuestion = rag.lastAssistantQuestion(prevMessages);

  const [ragOutput, memory, rackProfile, visitorLocation, briefing] = await Promise.all([
    rag.searchAll({
      query: asked,
      userId: 0, // ponytail: visitors have no userId, profile context will be empty
      jobIds: embed?.jobIds,
      rackInstitutionId: embed?.rackInstitutionId,
      // Both intake turns run blind on purpose: a model holding matching courses recommends them.
      skipCourses: !!input.discoveryTurn || !!input.streamTurn,
      pinnedCourseIds: rag.pinnedCourseIdsFrom(prevMessages),
      priorQuestion,
      onTrace: trace,
    }),
    embed?.rackInstitutionId
      ? retrieveMemories({
          institutionId: embed.rackInstitutionId,
          institutionName: embed.config.display_name,
          query: rag.resolveQuery(asked, priorQuestion),
          situation,
          pinnedOnly: rag.isCourtesyTurn(asked, priorQuestion),
          onTrace: trace,
        })
      : null,
    embed?.rackInstitutionId ? profileBlockFor(embed.rackInstitutionId) : "",
    // One branch read per turn, two consumers: the VISITOR LOCATION section (only when Cloudflare
    // said where the visitor is) and the campus map (which depends on the reply, not the visitor).
    // Sequential inside this slot so the recommendation reuses the rows rather than paging again.
    embed
      ? visitorService.attempt("ownerBranches", async () => {
          const branches = await visitorService.ownerBranches(embed.config);
          const match = input.headers
            ? await visitorService.branchRecommendationFor(embed.config, input.headers, branches)
            : null;
          return { branches, section: match?.section ?? null, invite: match?.invite ?? null };
        })
      : null,
    // Counselling guidance retrieved from the visitor's SITUATION rather than their question —
    // "they are applying from Nepal with a 6.0, raise the English pathway they did not ask about".
    // chat.service has had this since phase 7; the shared visitor path never called it, so every
    // public surface counselled with no briefing at all.
    //
    // No institutionId is passed, and since migration 20260909_003 that means the GLOBAL rack
    // only — unowned sources — so one institution's crawled site can never surface in another's
    // widget. Returns empty text when embeddings are unconfigured or nothing matches.
    //
    // Skipped on the two intake turns (their reply is scripted) and on a courtesy turn
    // ("thanks", "bye"), where there is nothing to brief: both save the embedding call outright.
    input.discoveryTurn || input.streamTurn || rag.isCourtesyTurn(asked, priorQuestion)
      ? null
      : rag.counsellorBriefing({
          message: asked,
          profile: visitorProfile,
          counsellingContext: visitorContext,
          onTrace: trace,
        }),
  ]);

  if (ragOutput.sources.length) input.onSources?.(ragOutput.sources);
  // Same treatment the platform gives them (chat.service): a briefing passage the reply leans on
  // is a source the visitor should be able to see.
  if (briefing?.sources.length) input.onSources?.(briefing.sources);

  const withheldMoneyTopics = rag.askedMoneyTopics(asked).filter((topic) => !ragOutput.moneyTopics.includes(topic));
  if (withheldMoneyTopics.length) trace(`Money question, no evidence for ${withheldMoneyTopics.join("/")}: that part withheld`);

  const base = buildSystemPrompt({
    profile: visitorProfile,
    counsellingContext: visitorContext,
    ragContext: ragOutput.contextText,
    isFirstMessage: history.length === 0,
    discoveryTurn: input.discoveryTurn,
    streamTurn: input.streamTurn,
    catalogue: input.catalogue,
    embedConfig: embed?.config,
    rackProfile,
    institutionGuidance: memory?.text,
    proactiveKnowledge: briefing?.text,
    withheldMoneyTopics,
    // The prompt reads the section; the wrap-up card's branch invite is handed back to the caller.
    visitorLocation: visitorLocation?.section ?? null,
    retrievalSkipped: !ragOutput.searched,
  });
  const system = input.surfaceNote ? `${base}\n\n${input.surfaceNote}` : base;

  const result = await streamChat({ system, history, userMessage: asked, onChunk: input.onChunk ?? (() => {}) });

  const cards = await withInstitutionMedia(rag.dropShownCards(parseCards(result.fullText), rag.pinnedCourseIdsFrom(prevMessages)));
  const chips = parseChips(result.fullText);
  // A comparison table is unreadable in a 380px panel (or a phone chat), so it is dropped; the
  // reply text carries the comparison in prose.
  const blocks = parseBlocks(result.fullText).filter((b) => b.type !== "comparison");
  const cleanText = stripBlocks(result.fullText);

  // Campus map. Server-appended like chat.service's `link` block, and for the same reason: the
  // model never names a place and never writes a query, so it cannot pin a campus that is not in
  // the branch table. The reply text IS the trigger — no prompt rule, no tokens on a prefix that
  // is already paid for every turn. The messaging channels strip blocks, which is why the prose
  // has to name the cities on its own; the map only ever enriches an answer that already works.
  // Two gates: the VISITOR must have asked about a place or how to reach us, and the reply must
  // then name a campus we can pin. The question gate came second (owner, 2026-10-14) — on the
  // reply alone the map rode along on nearly every turn, because a counsellor names the campus
  // city constantly, and a map under an answer about intake dates is noise.
  const pins = visitorLocation?.branches && asksAboutPlace(asked)
    ? mapLocationsFor(cleanText, visitorLocation.branches)
    : [];
  if (pins.length) blocks.push({ type: "map", locations: pins });

  return { result, cleanText, cards, chips, blocks, ragOutput, memory, visitorLocation };
}

/**
 * What the visitor told us about themselves this turn, read from THEIR message (its own model
 * call) and written in separate statements, so a lagging tenant schema costs one write, not the
 * turn. Returns the row as written, or the loaded one when nothing changed.
 */
export async function captureVisitorDetails(opts: {
  embed: EmbedContext | undefined;
  rules: VisitorRules;
  tenantDb: Knex | null;
  visitor: visitorService.VisitorRow | null;
  visitorKey: string | null;
  history: ChatHistory;
  asked: string;
}) {
  const { tenantDb, visitor, embed } = opts;
  const { profile, contact, custom } = visitor && tenantDb && embed
    ? await extractProfile(opts.history, opts.asked, opts.rules.keepable, opts.rules.customFields)
    : { profile: null, contact: null, custom: null };

  if (profile && visitor && tenantDb) {
    await visitorService.attempt("recordProfile", () => visitorService.recordProfile(tenantDb, visitor.id, profile));
  }
  if (custom && visitor && tenantDb) {
    await visitorService.attempt("recordCustom", () => visitorService.recordCustom(tenantDb, visitor.id, custom));
  }
  let current = visitor;
  if (contact && visitor && tenantDb && opts.visitorKey && embed) {
    current = await visitorService.attempt("recordVolunteeredContact", () =>
      visitorService.recordVolunteeredContact(tenantDb, { visitorKey: opts.visitorKey!, embedConfigId: embed.config.id, ...contact }),
    ) ?? visitor;
  }
  return { profile, current };
}
