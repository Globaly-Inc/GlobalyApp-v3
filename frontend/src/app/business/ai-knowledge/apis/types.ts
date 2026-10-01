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
  "AVOIDANCE_RULE", "GENERAL_CONTEXT",
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
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
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

export interface CollectionRules {
  allowed: CollectableField[];
  /** Usable in the conversation, never written down. */
  sensitive: CollectableField[];
  /** The counsellor may ask outright; everything else is recorded only if offered. */
  may_ask_for: CollectableField[];
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
