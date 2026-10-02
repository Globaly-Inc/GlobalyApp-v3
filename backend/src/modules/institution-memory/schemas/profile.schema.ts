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
  /** BCP-47-ish. English by default; empty means answer in whatever language the visitor writes in. */
  language: z.string().trim().max(10).default("en"),
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
 * `gender` and `age` were once off by default (an analysis flagged them as collected with no
 * stated purpose). They are on by default since 2026-10-02; an institution that does not want
 * them switches them off.
 *
 * Name, email and phone are NOT among the choices. They are recorded for every visitor, the
 * portal offers no record/may-ask/sensitive control for them, and the transforms below hold that
 * line on every parse — a product decision, taken twice, not an oversight.
 *
 * What it costs, stated plainly because a later reader will meet it as a surprise: an
 * institution whose stored `allowed` omits `phone` starts recording phone numbers on the next
 * read. That list is also what an institution gets by never touching this page — `phone` was off
 * BY DEFAULT before, so an absent `phone` is not evidence that anyone chose to withhold it, and
 * nothing in the row can tell the two apart. The states that DO prove a deliberate act, because
 * they differ from the old defaults, are `name`/`email` removed from `allowed` and any contact
 * field in `sensitive`; count those before deploying, and tell those institutions rather than
 * flipping it silently.
 *
 * `mayKeepEmail` stays and still earns its place: its live branch is now the degraded one, where
 * we cannot read the rules and therefore keep nothing.
 */
// age and gender joined the defaults on 2026-10-02 (product call: the visitor page should show
// what the visitor said). An institution can still switch either off in AI knowledge.
const DEFAULT_ALLOWED: CollectableField[] = [
  "age", "gender", "nationality", "study_preference", "qualifications", "language_tests", "academic_tests",
  "work_experiences", "name", "email", "phone",
];

/** Always recorded, never qualified. */
export const CONTACT_FIELDS = ["name", "email", "phone"] as const;
const isContact = (f: CollectableField) => (CONTACT_FIELDS as readonly string[]).includes(f);

const FieldList = z.array(Field).max(COLLECTABLE_FIELDS.length);
/**
 * Enforced on the FIELD, not in the portal, because the portal is one of two writers: an API
 * caller that PATCHes a list without `email`, or marks a phone number sensitive, must not end up
 * with storage and the prompt disagreeing about whether that field exists.
 */
const RecordList = FieldList.transform((f): CollectableField[] => [...new Set([...f, ...CONTACT_FIELDS])]);
const QualifierList = FieldList.transform((f): CollectableField[] => f.filter((x) => !isContact(x)));

// ── Custom fields ────────────────────────────────────────────────────────────

/**
 * A subject this institution collects that the fixed vocabulary has no name for — "Preferred
 * intake", "Budget", "Where they heard about us".
 *
 * `key` is the STORAGE key: the portal mints it once, when the field is added, from the label
 * plus a random tail, and nothing ever recomputes it. The tail is what makes removal mean
 * removal — a second "Budget" field mints a new key, so answers stored under the old one are
 * orphaned instead of walking back into the counsellor's notes. Values live in
 * `ai_widget_visitor_custom_values` (20261002_001), one row per visitor per field: a typed home
 * with a cleaner in front of it, which is what 20261001_002 requires of anything the extractor
 * writes — never a key in `meta`.
 *
 * The label is whitespace-collapsed, and that is not cosmetic: it rides the line-delimited
 * profile block, where a pasted newline would break every bullet after it.
 */
export const CUSTOM_FIELD_MAX = 10;
export const CustomFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "A field key is lower-case letters, digits and underscores"),
  label: z.string().trim().min(1).max(60).transform((v) => v.replace(/\s+/g, " ")),
  /** The counsellor may raise it itself. Off means record it only when the visitor offers it. */
  may_ask: z.boolean().default(false),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

/** Last definition of a key wins, so a resend cannot produce two rows the extractor both fills. */
const CustomList = z.array(CustomFieldSchema).max(CUSTOM_FIELD_MAX).transform((fields): CustomField[] => {
  const byKey = new Map<string, CustomField>();
  for (const f of fields) byKey.set(f.key, f);
  return [...byKey.values()];
});

/**
 * A [min, max] message range, checked for ORDER as well as bounds.
 *
 * Bounds alone were not enough and the failure was silent: visitor.service's `askAt` computes
 * `min + (hash % (max - min + 1))`, so a reversed pair makes the span zero, `% 0` is NaN, and
 * every `nextCount >= askAt(...)` comparison is false forever. The contact card simply stops
 * appearing, with nothing logged and nothing thrown. Only an API caller can get a pair in here —
 * the portal exposes `enabled` and not the numbers — but a setting that disables a feature by
 * arithmetic accident is worth one refine.
 */
const AskRange = z
  .tuple([z.number().int().min(1).max(50), z.number().int().min(1).max(50)])
  .refine(([min, max]) => min <= max, { message: "The first number must not be greater than the second" });

export const CollectionSchema = z.object({
  /** What the counsellor may record about a visitor. Anything absent is never persisted. */
  allowed: RecordList.default(DEFAULT_ALLOWED),
  /**
   * Allowed to be USED in the conversation, never written down. A visitor volunteering a
   * disability to ask about support should get an answer, not a record of it.
   */
  sensitive: QualifierList.default([]),
  /** The counsellor may ask for these outright; everything else it only records if offered. */
  may_ask_for: QualifierList.default(["study_preference"]),
  /** Institution-defined subjects. Recorded like any allowed field; see CustomFieldSchema. */
  custom: CustomList.default([]),
  contact_ask: z.object({
    enabled: z.boolean().default(true),
    /** Absolute message number for the first ask — matches visitor.service's FIRST_ASK_AT. */
    first_at: AskRange.default([3, 5]),
    /** Message gap before every later ask — matches RE_ASK_GAP. */
    gap: AskRange.default([5, 10]),
  }).default({}),
});
export type CollectionRules = z.infer<typeof CollectionSchema>;

// ── Learning ─────────────────────────────────────────────────────────────────

export const LearningSchema = z.object({
  /**
   * Learn counselling patterns from finished conversations.
   *
   * Sits beside the older per-widget `ai_embed_configs.auto_learn`, and learning runs when
   * EITHER is on (learning-signals.onConversationEnd). This one is institution-wide and is what
   * the portal exposes; the column stays so a widget already set up that way keeps working.
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

/**
 * Every block optional — the form PATCHes whichever card was edited.
 *
 * `expected_version` is REQUIRED, not optional, and that is the point: it is the version the
 * editor was built from, and a save without one is a save that can silently overwrite whatever
 * landed in between. Zero means "there was no row when I read it".
 */
export const PatchRackProfileSchema = z.object({
  expected_version: z.coerce.number().int().min(0),
  voice: VoiceSchema.partial().optional(),
  behaviour: BehaviourSchema.partial().optional(),
  collection: CollectionSchema.partial().optional(),
  learning: LearningSchema.partial().optional(),
}).strict();
export type PatchRackProfileInput = z.infer<typeof PatchRackProfileSchema>;
/** The wire envelope minus the concurrency token — what the service and repository actually write. */
export type PatchRackProfileBlocks = Omit<PatchRackProfileInput, "expected_version">;

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
