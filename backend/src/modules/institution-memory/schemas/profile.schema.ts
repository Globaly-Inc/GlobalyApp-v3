// The institution's AI Knowledge Rack configuration: voice, behaviour, data-collection rules
// and learning opt-ins. zod first, types by z.infer, exactly as memory.schema.ts.
//
// Every block is `.partial()`-shaped through `.default()` on each field, so a stored `{}` parses
// into the full default set. That is what lets an institution with no row — and a row written
// before a field existed — read as a complete profile rather than as undefined scattered through
// the renderer.
//
// These are CONFIGURATION, deliberately separate from RESPONSE_PREFERENCE memories. A preference
// the system learned is advisory and outranked by what the institution actually set; see
// renderProfileBlock, which says so to the model in as many words.

import { z } from "zod";
import { PROFILE_KEYS, PROFILE_SCALARS } from "../../ai-counsellor/lib/card-parser.js";

// ── Voice ────────────────────────────────────────────────────────────────────

export const TONES = ["warm", "neutral", "formal", "enthusiastic"] as const;
export const RESPONSE_LENGTHS = ["brief", "standard", "detailed"] as const;

const Scale = z.number().int().min(1).max(5);

export const VoiceSchema = z.object({
  tone: z.enum(TONES).default("warm"),
  /** 1 = first names and contractions, 5 = full titles and no contractions. */
  formality: Scale.default(3),
  /** 1 = strictly transactional, 5 = openly encouraging. */
  warmth: Scale.default(3),
  response_length: z.enum(RESPONSE_LENGTHS).default("standard"),
  /** BCP-47-ish. Empty means answer in whatever language the visitor writes in. */
  language: z.string().trim().max(10).default(""),
  use_cards: z.boolean().default(true),
});
export type VoiceProfile = z.infer<typeof VoiceSchema>;

// ── Behaviour ────────────────────────────────────────────────────────────────

export const COUNSELLING_STYLES = ["consultative", "directive", "informational"] as const;
export const FOLLOW_UP_MODES = ["always", "when_unclear", "never"] as const;
export const RECOMMENDATION_MODES = ["brief_reason", "full_rationale", "comparison"] as const;
export const UNCERTAINTY_MODES = ["say_unknown", "offer_to_check", "defer_to_human"] as const;
export const LEAD_APPROACHES = ["never_ask", "when_natural", "actively_offer"] as const;
export const INITIATIVE_MODES = ["reactive", "balanced", "proactive"] as const;

export const BehaviourSchema = z.object({
  counselling_style: z.enum(COUNSELLING_STYLES).default("consultative"),
  ask_follow_ups: z.enum(FOLLOW_UP_MODES).default("when_unclear"),
  explain_recommendations: z.enum(RECOMMENDATION_MODES).default("brief_reason"),
  uncertainty: z.enum(UNCERTAINTY_MODES).default("say_unknown"),
  lead_approach: z.enum(LEAD_APPROACHES).default("when_natural"),
  initiative: z.enum(INITIATIVE_MODES).default("balanced"),
});
export type BehaviourProfile = z.infer<typeof BehaviourSchema>;

// ── Data collection ──────────────────────────────────────────────────────────

/**
 * The vocabulary is the writer's own field list, not a second list that can drift from it:
 * PROFILE_SCALARS and PROFILE_KEYS are what lib/card-parser lets the extractor return, plus the
 * three contact fields the widget can capture.
 */
export const COLLECTABLE_FIELDS = [
  ...PROFILE_SCALARS, ...PROFILE_KEYS, "name", "email", "phone",
] as const;
export type CollectableField = (typeof COLLECTABLE_FIELDS)[number];
const Field = z.enum(COLLECTABLE_FIELDS);

/**
 * Defaults say no to the two the analysis flagged: `gender` and `age` are collected from every
 * visitor today with no stated purpose, and `phone` is more than a counsellor needs to answer a
 * question. An institution that wants them turns them on and owns that choice.
 */
const DEFAULT_ALLOWED: CollectableField[] = [
  "nationality", "study_preference", "qualifications", "language_tests", "academic_tests",
  "work_experiences", "name", "email",
];

export const CollectionSchema = z.object({
  /** What the counsellor may record about a visitor. Anything absent is never persisted. */
  allowed: z.array(Field).max(COLLECTABLE_FIELDS.length).default(DEFAULT_ALLOWED),
  /**
   * Allowed to be USED in the conversation, never written down. A visitor volunteering a
   * disability to ask about support should get an answer, not a record of it.
   */
  sensitive: z.array(Field).max(COLLECTABLE_FIELDS.length).default([]),
  /** The counsellor may ask for these outright; everything else it only records if offered. */
  may_ask_for: z.array(Field).max(COLLECTABLE_FIELDS.length).default(["study_preference"]),
  contact_ask: z.object({
    enabled: z.boolean().default(true),
    /** Absolute message number for the first ask — matches visitor.service's FIRST_ASK_AT. */
    first_at: z.tuple([z.number().int().min(1).max(50), z.number().int().min(1).max(50)]).default([3, 5]),
    /** Message gap before every later ask — matches RE_ASK_GAP. */
    gap: z.tuple([z.number().int().min(1).max(50), z.number().int().min(1).max(50)]).default([5, 10]),
  }).default({}),
});
export type CollectionRules = z.infer<typeof CollectionSchema>;

// ── Learning ─────────────────────────────────────────────────────────────────

export const LearningSchema = z.object({
  /**
   * Learn counselling patterns from finished conversations. Mirrors
   * ai_embed_configs.auto_learn, which stays the authority until every widget is migrated —
   * profile.service reads this only when the column is false, so turning it on here cannot
   * silently override a widget the institution deliberately switched off.
   */
  auto_learn: z.boolean().default(false),
  /** Allow general sector facts as human-approval-only candidates. Phase 4; off until then. */
  learn_general_knowledge: z.boolean().default(false),
});
export type LearningRules = z.infer<typeof LearningSchema>;

// ── The row ──────────────────────────────────────────────────────────────────

export const RackProfileSchema = z.object({
  voice: VoiceSchema.default({}),
  behaviour: BehaviourSchema.default({}),
  collection: CollectionSchema.default({}),
  learning: LearningSchema.default({}),
});
export type RackProfile = z.infer<typeof RackProfileSchema>;

/** Every block optional — the form PATCHes whichever card was edited. */
export const PatchRackProfileSchema = z.object({
  voice: VoiceSchema.partial().optional(),
  behaviour: BehaviourSchema.partial().optional(),
  collection: CollectionSchema.partial().optional(),
  learning: LearningSchema.partial().optional(),
}).strict();
export type PatchRackProfileInput = z.infer<typeof PatchRackProfileSchema>;

/** Parsing `{}` yields the full default profile — the one place that fact is asserted. */
export const DEFAULT_PROFILE: RackProfile = RackProfileSchema.parse({});

export const RackProfileRowSchema = z.object({
  voice: z.unknown(),
  behaviour: z.unknown(),
  collection: z.unknown(),
  learning: z.unknown(),
  version: z.number().int().min(1),
  updated_by: z.number().int().nullable(),
  updated_at: z.coerce.date(),
});
