// The Rack's configuration half: read it, write it, render it into a system prompt.
//
// Why this is a row and not a RESPONSE_PREFERENCE memory: memories are retrieved by similarity
// and carry a lifecycle (candidate, votes, decay). Voice is neither — it applies to every reply,
// it is never learned, and nobody should have to approve their own setting. The memory type
// stays for style the system LEARNED, and renderProfileBlock tells the model which wins.
//
// Rendering only emits what DIFFERS from the defaults, so an institution that changed one thing
// pays for one line and every byte in the block corresponds to a choice someone made.
//
// One exception, and it is deliberate: the default allow-list withholds age, gender and phone,
// and a model that is NOT told to withhold them will ask for them. A privacy default stricter
// than the model's own behaviour has to be spent on, so an untouched profile still emits that
// single line. Everything else stays silent until someone changes it.

import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/profile.repository.js";
import {
  DEFAULT_PROFILE, PatchRackProfileSchema, RackProfileSchema,
  type CollectableField, type PatchRackProfileInput, type RackProfile,
} from "../schemas/profile.schema.js";

const logger = createChildLogger("institution-rack-profile");

const CACHE_TTL_MS = 60_000;

// ponytail: in-process map, one backend process today — same call as retrieval.service's
// zero-count cache. A stale entry costs one minute of the previous voice, never a wrong answer.
const cache = new Map<number, { value: repo.StoredProfile; until: number }>();
export const clearProfileCache = () => cache.clear();

export async function getProfile(institutionId: number): Promise<repo.StoredProfile> {
  const hit = cache.get(institutionId);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await repo.get(institutionId);
  cache.set(institutionId, { value, until: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Merge a partial edit over what is stored and write the whole profile back. */
export async function patchProfile(
  institutionId: number,
  patch: PatchRackProfileInput,
  updatedBy: number | null,
): Promise<repo.StoredProfile> {
  const current = (await repo.get(institutionId)).profile;
  // Block-level merge, not a deep one: each block is edited as a unit by one card in the portal,
  // and a deep merge would make "clear this list" impossible to express.
  const merged = RackProfileSchema.parse({
    voice: { ...current.voice, ...patch.voice },
    behaviour: { ...current.behaviour, ...patch.behaviour },
    collection: { ...current.collection, ...patch.collection },
    learning: { ...current.learning, ...patch.learning },
  });
  const saved = await repo.put(institutionId, merged, updatedBy);
  cache.delete(institutionId);
  return saved;
}

export const parsePatch = (body: unknown): PatchRackProfileInput => PatchRackProfileSchema.parse(body);

// ── Rendering ────────────────────────────────────────────────────────────────

const TONE_LINE: Record<RackProfile["voice"]["tone"], string> = {
  warm: "Warm and personable.",
  neutral: "Even and matter-of-fact.",
  formal: "Formal and professional.",
  enthusiastic: "Enthusiastic about what we offer, without overselling.",
};

const LENGTH_LINE: Record<RackProfile["voice"]["response_length"], string> = {
  brief: "Keep replies short — a direct answer and one supporting sentence.",
  standard: "Answer fully but without padding.",
  detailed: "Give the full picture, including the context behind the answer.",
};

const STYLE_LINE: Record<RackProfile["behaviour"]["counselling_style"], string> = {
  consultative: "Counsel: understand their situation before steering them anywhere.",
  directive: "Be decisive — give a clear recommendation rather than a menu.",
  informational: "Answer what was asked. Do not steer unless they ask you to.",
};

const FOLLOW_UP_LINE: Record<RackProfile["behaviour"]["ask_follow_ups"], string> = {
  always: "End with one question that moves the conversation on.",
  when_unclear: "Ask a follow-up only when the answer genuinely depends on it.",
  never: "Do not ask follow-up questions. Answer and stop.",
};

const RECOMMENDATION_LINE: Record<RackProfile["behaviour"]["explain_recommendations"], string> = {
  brief_reason: "When you recommend something, give the one reason it fits them.",
  full_rationale: "When you recommend something, explain the reasoning, including the trade-offs.",
  comparison: "When you recommend something, show it against the nearest alternative.",
};

const UNCERTAINTY_LINE: Record<RackProfile["behaviour"]["uncertainty"], string> = {
  say_unknown: "When you do not know, say so plainly.",
  offer_to_check: "When you do not know, say so and offer to have someone check.",
  defer_to_human: "When you do not know, say so and point them to a human counsellor.",
};

const LEAD_LINE: Record<RackProfile["behaviour"]["lead_approach"], string> = {
  never_ask: "Never ask for their contact details. Record them only if they volunteer them.",
  when_natural: "Ask for contact details only at a natural point, and never twice in a row.",
  actively_offer: "Offer to follow up by email when you have given them something worth keeping.",
};

const INITIATIVE_LINE: Record<RackProfile["behaviour"]["initiative"], string> = {
  reactive: "Answer what is asked. Do not raise topics they have not.",
  balanced: "Raise something they have not asked about only when it materially affects them.",
  proactive: "Flag what they have not thought to ask about — deadlines, requirements, next steps.",
};

const FIELD_LABEL: Partial<Record<CollectableField, string>> = {
  age: "age", gender: "gender", nationality: "nationality", study_preference: "the course they want",
  qualifications: "qualifications", language_tests: "English test results",
  academic_tests: "admission test results", work_experiences: "work history",
  name: "their name", email: "their email", phone: "their phone number",
};

const label = (f: CollectableField): string => FIELD_LABEL[f] ?? String(f).replace(/_/g, " ");

/**
 * The COUNSELLING STYLE block, or "" when the institution has changed nothing.
 *
 * Deliberately phrased as instructions rather than as a settings dump: "Keep replies short" is
 * something a model follows; `response_length: brief` is something it has to interpret.
 */
export function renderProfileBlock(profile: RackProfile): string {
  const d = DEFAULT_PROFILE;
  const v = profile.voice;
  const b = profile.behaviour;
  const lines: string[] = [];

  if (v.tone !== d.voice.tone) lines.push(TONE_LINE[v.tone]);
  if (v.response_length !== d.voice.response_length) lines.push(LENGTH_LINE[v.response_length]);
  if (v.formality !== d.voice.formality) {
    lines.push(v.formality >= 4
      ? "Address them formally; avoid contractions and first names."
      : "Write the way a person speaks — contractions are fine, first names are fine.");
  }
  if (v.warmth !== d.voice.warmth) {
    lines.push(v.warmth >= 4
      ? "Be encouraging; acknowledge what they are trying to do before answering."
      : "Stay businesslike. Skip reassurance they did not ask for.");
  }
  if (v.language) lines.push(`Reply in ${v.language} unless they write in another language.`);
  if (v.use_cards !== d.voice.use_cards && !v.use_cards) lines.push("Do not use course cards; describe courses in prose.");

  if (b.counselling_style !== d.behaviour.counselling_style) lines.push(STYLE_LINE[b.counselling_style]);
  if (b.ask_follow_ups !== d.behaviour.ask_follow_ups) lines.push(FOLLOW_UP_LINE[b.ask_follow_ups]);
  if (b.explain_recommendations !== d.behaviour.explain_recommendations) lines.push(RECOMMENDATION_LINE[b.explain_recommendations]);
  if (b.uncertainty !== d.behaviour.uncertainty) lines.push(UNCERTAINTY_LINE[b.uncertainty]);
  if (b.lead_approach !== d.behaviour.lead_approach) lines.push(LEAD_LINE[b.lead_approach]);
  if (b.initiative !== d.behaviour.initiative) lines.push(INITIATIVE_LINE[b.initiative]);

  const collection = renderCollectionLines(profile);
  if (!lines.length && !collection.length) return "";

  return [
    "COUNSELLING STYLE (set by this institution; it outranks any style the system has learned, " +
    "and never overrides privacy, safety, or facts-only rules):",
    ...lines.map((l) => `  - ${l}`),
    ...collection,
  ].join("\n");
}

/**
 * What the counsellor may ask for, and what it must not write down.
 *
 * Only rendered when it says something the model would not otherwise assume. "Never ask for X"
 * is always worth the characters; the allow-list is not, because a model that was never told to
 * collect something does not go looking for it.
 */
function renderCollectionLines(profile: RackProfile): string[] {
  const c = profile.collection;
  const out: string[] = [];

  // Only when it differs from the default, or every institution that configured nothing would
  // still pay a line for it — and "an untouched profile adds nothing to the prompt" is the
  // property this whole renderer is built around.
  const d = DEFAULT_PROFILE.collection;
  const mayAsk = c.may_ask_for.filter((f) => c.allowed.includes(f));
  const mayAskChanged = mayAsk.length !== d.may_ask_for.length || mayAsk.some((f) => !d.may_ask_for.includes(f));
  if (mayAsk.length && mayAskChanged) {
    out.push(`  - You may ask directly for: ${mayAsk.map(label).join(", ")}. Anything else, record only if they offer it.`);
  }

  // The important half. A field that is not allowed must never be written down, and the model
  // is the only thing standing between a volunteered sentence and a stored one.
  const offLimits = (["age", "gender", "phone", "name", "email"] as CollectableField[])
    .filter((f) => !c.allowed.includes(f));
  if (offLimits.length) {
    out.push(`  - Never ask for, and never repeat back, ${offLimits.map(label).join(", ")}.`);
  }

  // The consent posture for volunteered details. The counsellor now reads an address out of
  // prose and stores it, so the visitor has to hear that happen — confirming once is the
  // difference between a counsellor that listened and one that harvested. Rendered whenever
  // email is collectable, which is the default, because it applies to that default.
  if (c.allowed.includes("email")) {
    out.push("  - If they give you an email or phone number in passing, confirm it back to them once "
      + "(\"I'll send that to <address> — is that right?\") before relying on it. Never ask twice.");
  }

  if (c.sensitive.length) {
    // The model is told, AND the extractor is never handed these fields (guest.routes subtracts
    // them from `allowed`). Saying it here alone would be a promise the storage breaks.
    out.push(`  - Treat ${c.sensitive.map(label).join(", ")} as sensitive: use it to answer, never record it.`);
  }

  if (!c.contact_ask.enabled) {
    out.push("  - Never ask for contact details. If they offer them, acknowledge and move on.");
  }
  return out;
}

/** The prompt block for one institution, cached. "" when nothing is configured. */
export async function profileBlockFor(institutionId: number): Promise<string> {
  try {
    const { profile } = await getProfile(institutionId);
    return renderProfileBlock(profile);
  } catch (err) {
    logger.warn("Rack profile block failed; continuing without it", { institutionId, err: String(err) });
    return "";
  }
}
