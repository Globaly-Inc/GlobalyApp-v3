// Wire types for the institution's AI knowledge — what its counsellor has been told and has
// learned, and the widget conversations it can review.
//
// Mirrors backend/src/modules/institution-memory/schemas/memory.schema.ts (MemoryRowSchema,
// MEMORY_TYPES, MEMORY_SOURCES, MEMORY_STATUSES) and the two review shapes in
// repositories/learning.repository.ts (ReviewSession, ReviewMessage). Keep the vocabularies in
// step with that file — they are zod `as const` tuples there, not DB enums, so nothing errors
// if they drift; a value simply renders without a label.

export const MEMORY_TYPES = [
  "COUNSELLING_GUIDELINE", "RESPONSE_PREFERENCE", "RESPONSE_PATTERN", "INSTITUTION_POLICY",
  "COURSE_RECOMMENDATION_RULE", "TERMINOLOGY", "STUDENT_CONCERN_PATTERN", "COUNSELLOR_CORRECTION",
  "AVOIDANCE_RULE", "GENERAL_CONTEXT", "GENERAL_KNOWLEDGE",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Who said it. Decides whether a vote may retire the memory or only flag it. */
export const MEMORY_SOURCES = ["admin", "correction", "feedback", "extracted"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_STATUSES = ["candidate", "active", "deprecated", "deleted"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type HistoryEvent =
  | "created" | "reinforced" | "promoted" | "deprecated" | "reactivated"
  | "deleted" | "voted" | "flagged" | "edited" | "conflict_flagged";

export interface MemoryHistoryEntry {
  at: string;
  event: HistoryEvent;
  reason?: string;
  by?: { kind: "admin" | "counsellor" | "student" | "system"; id?: string };
}

/** Provenance. Actor ids are 16-hex hashes server-side — never a raw user id or fingerprint. */
export interface MemorySourceReference {
  message_id?: number;
  session_id?: number;
  actors: string[];
  positive_voters: string[];
  negative_voters: string[];
}

export interface Memory {
  id: string;
  institution_id: number;
  type: MemoryType;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  source: MemorySource;
  source_reference: MemorySourceReference;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  version: number;
  reinforce_count: number;
  use_count: number;
  /** False means similarity retrieval misses it; it can still be pinned and listed. */
  has_embedding: boolean;
  flagged_at: string | null;
  /** Set on a learned candidate that contradicts this memory. Blocks auto-promotion. */
  conflicts_with_id: string | null;
  history: MemoryHistoryEntry[];
  created_by: number | null;
  /** Resolved server-side from `created_by`. Null for anything the system wrote — a learned
   *  candidate has no author, which is not the same as an author we failed to look up. */
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

/** The header's figures, counted server-side. See GET /institution/memories/summary. */
export interface MemoryCounts {
  active: number;
  candidate: number;
  conflicting: number;
  flagged: number;
  alwaysOn: number;
  /** Counted per row, so a candidate that also contradicts something is one piece of work. */
  needsYou: number;
  /** Assistant replies nobody has reviewed, over EVERY conversation — not the 50 the
   *  conversations tab happens to be showing. */
  unreviewedReplies: number;
}

export interface MemoryListParams {
  status?: MemoryStatus;
  type?: MemoryType;
  source?: MemorySource;
  flagged?: boolean;
  /** Only candidates that contradict an existing memory — the review queue. */
  conflicting?: boolean;
  q?: string;
  limit?: number;
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  expires_at?: string | null;
}

export interface PatchMemoryInput {
  content?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  expires_at?: string | null;
}

/**
 * POST /memories answers with the lifecycle outcome, not just the row: the same statement sent
 * twice is evidence, not a duplicate, so the UI has to say which of these happened.
 */
export interface CreateMemoryOutcome {
  outcome: "created" | "reinforced" | "promoted" | "reactivated" | "rejected";
  memory: Memory;
  promoted?: boolean;
  reason?: "previously_deprecated";
}

// ── Review queue ─────────────────────────────────────────────────────────────

export interface ReviewSession {
  id: number;
  embed_config_id: number;
  title: string | null;
  message_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  /** Assistant replies with no review yet. */
  unreviewed: number;
  /** Replies a visitor thumbed down. */
  flagged: number;
}

export interface ReviewMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards: unknown[];
  feedback: "positive" | "negative" | null;
  review_status: ReviewStatus | null;
  correction: string | null;
  review_note: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  /** Which memories shaped this reply — approving reinforces exactly these. */
  memory_ids: string[];
  created_at: string;
}

export const REVIEW_STATUSES = ["approved", "corrected", "flagged"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewInput {
  status: ReviewStatus;
  /** Required when status is "corrected" — this is what the counsellor learns from. */
  correction?: string;
  note?: string;
}

// ── Knowledge Rack configuration ─────────────────────────────────────────────
// Mirrors backend/src/modules/institution-memory/schemas/profile.schema.ts. Vocabularies are
// zod `as const` tuples there, not DB enums — a value that drifts renders without a label
// rather than erroring.

export const TONES = ["warm", "neutral", "formal", "enthusiastic"] as const;
export const RESPONSE_LENGTHS = ["brief", "standard", "detailed"] as const;
export const COUNSELLING_STYLES = ["consultative", "directive", "informational"] as const;
export const FOLLOW_UP_MODES = ["always", "when_unclear", "never"] as const;
export const RECOMMENDATION_MODES = ["brief_reason", "full_rationale", "comparison"] as const;
export const UNCERTAINTY_MODES = ["say_unknown", "offer_to_check", "defer_to_human"] as const;
export const LEAD_APPROACHES = ["never_ask", "when_natural", "actively_offer"] as const;
export const INITIATIVE_MODES = ["reactive", "balanced", "proactive"] as const;

/** Everything the counsellor may record about a visitor — the extractor's own field list. */
export const COLLECTABLE_FIELDS = [
  "age", "gender", "nationality", "study_preference",
  "qualifications", "language_tests", "academic_tests", "work_experiences",
  "name", "email", "phone",
] as const;
export type CollectableField = (typeof COLLECTABLE_FIELDS)[number];

/** Always recorded, never qualified — the backend forces these into `allowed` on every write. */
export const CONTACT_FIELDS = ["name", "email", "phone"] as const;

export interface VoiceProfile {
  tone: (typeof TONES)[number];
  formality: number;
  warmth: number;
  response_length: (typeof RESPONSE_LENGTHS)[number];
  language: string;
  use_cards: boolean;
}

export interface BehaviourProfile {
  counselling_style: (typeof COUNSELLING_STYLES)[number];
  ask_follow_ups: (typeof FOLLOW_UP_MODES)[number];
  explain_recommendations: (typeof RECOMMENDATION_MODES)[number];
  uncertainty: (typeof UNCERTAINTY_MODES)[number];
  lead_approach: (typeof LEAD_APPROACHES)[number];
  initiative: (typeof INITIATIVE_MODES)[number];
}

/**
 * An institution-defined subject. `key` is minted once, when the field is added, and never
 * recomputed or reissued: it carries a random tail precisely so that removing a field and adding
 * the same name back starts empty rather than resurrecting the answers it used to hold.
 */
export interface CustomField {
  key: string;
  label: string;
  /** The counsellor may raise it itself; off means record it only when the visitor offers. */
  may_ask: boolean;
}

/** Matches CUSTOM_FIELD_MAX on the backend — a longer list is a 400, not a silent truncation. */
export const CUSTOM_FIELD_MAX = 10;

export interface CollectionRules {
  allowed: CollectableField[];
  /** Usable in the conversation, never written down. */
  sensitive: CollectableField[];
  /** The counsellor may ask outright; everything else is recorded only if offered. */
  may_ask_for: CollectableField[];
  custom: CustomField[];
  contact_ask: { enabled: boolean; first_at: [number, number]; gap: [number, number] };
}

export interface LearningRules {
  auto_learn: boolean;
  learn_general_knowledge: boolean;
}

export interface RackProfile {
  voice: VoiceProfile;
  behaviour: BehaviourProfile;
  collection: CollectionRules;
  learning: LearningRules;
}

export interface StoredRackProfile {
  profile: RackProfile;
  version: number;
  updated_at: string | null;
  /** False while the institution is still on the defaults. */
  configured: boolean;
}

/**
 * Every block optional — the form PATCHes whichever block was edited.
 *
 * `expected_version` is required: it is the version the editor was built from, and the backend
 * applies the write only while the stored row still matches. Without it, two members saving at
 * once meant the later save silently reverted the earlier one's settings.
 */
export interface PatchRackProfileInput {
  expected_version: number;
  voice?: Partial<VoiceProfile>;
  behaviour?: Partial<BehaviourProfile>;
  collection?: Partial<CollectionRules>;
  learning?: Partial<LearningRules>;
}

// ── Conversion insights ──────────────────────────────────────────────────────
// Mirrors ConversionInsights in backend/src/modules/institution-memory/schemas/signals.schema.ts.
// Every figure is a count over JOURNEYS — the table behind it holds no transcript, no visitor and
// no message, so nothing here can identify anyone.

/** The closed topic vocabulary journeys are labelled with. */
export const JOURNEY_TOPICS = [
  "course", "eligibility", "fees", "scholarship", "application", "visa", "accommodation", "contact", "other",
] as const;
export type JourneyTopic = (typeof JOURNEY_TOPICS)[number];

/**
 * One mined step. `support` counts CONVERSATIONS containing it, not occurrences, so a journey
 * that loops back through the same pair contributes one.
 */
export interface TopicTransition {
  from: string;
  to: string;
  support: number;
  converted: number;
  /** The step already phrased as a guideline — composed by the backend, which owns the
   *  vocabulary and validates the 600-char Content ceiling this is POSTed back into. */
  suggestion: string;
}

export interface ConversionInsights {
  conversations: number;
  converted: number;
  /** Converted without the counsellor ever asking — the "easy conversion". */
  volunteered: number;
  /** Converted having been asked at least once. */
  prompted: number;
  median_messages_to_conversion: number | null;
  /** Time from first message to sharing details — §10's "time to conversion". */
  median_seconds_to_conversion: number | null;
  top_paths: Array<{ path: string[]; count: number }>;
  topic_before_conversion: Array<{ value: string; count: number }>;
  first_topic: Array<{ value: string; count: number }>;
  /** Empty until a step appears in enough conversations to be more than coincidence. */
  transitions: TopicTransition[];
}
