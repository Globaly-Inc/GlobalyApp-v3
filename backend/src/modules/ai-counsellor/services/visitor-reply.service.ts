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
  const visitorContext = visitorCounsellingContext(visible, rules.customFields, customValues);
  const situation = rag.situationText(visitorProfile, visitorContext);
  const priorQuestion = rag.lastAssistantQuestion(prevMessages);

  const [ragOutput, memory, rackProfile, visitorLocation] = await Promise.all([
    rag.searchAll({
      query: asked,
      userId: 0, // ponytail: visitors have no userId, profile context will be empty
      jobIds: embed?.jobIds,
      rackInstitutionId: embed?.rackInstitutionId,
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
    embed && input.headers
      ? visitorService.attempt("branchRecommendation", () => visitorService.branchRecommendationFor(embed.config, input.headers!))
      : null,
  ]);

  if (ragOutput.sources.length) input.onSources?.(ragOutput.sources);

  const withheldMoneyTopics = rag.askedMoneyTopics(asked).filter((topic) => !ragOutput.moneyTopics.includes(topic));
  if (withheldMoneyTopics.length) trace(`Money question, no evidence for ${withheldMoneyTopics.join("/")}: that part withheld`);

  const base = buildSystemPrompt({
    profile: visitorProfile,
    counsellingContext: visitorContext,
    ragContext: ragOutput.contextText,
    isFirstMessage: history.length === 0,
    embedConfig: embed?.config,
    rackProfile,
    institutionGuidance: memory?.text,
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
