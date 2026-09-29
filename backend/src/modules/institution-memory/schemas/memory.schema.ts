// Institution AI memory — every vocabulary and shape, zod first, types by z.infer.
//
// One table (institution_ai_memories), one retrieval function, one learning queue. The two
// JSONB columns that admins and the model write (metadata, history) are parsed with these
// schemas on read as well as on write.

import { z } from "zod";

// ── Vocabularies ─────────────────────────────────────────────────────────────

export const MEMORY_TYPES = [
  "COUNSELLING_GUIDELINE",
  "RESPONSE_PREFERENCE",
  "RESPONSE_PATTERN",
  "INSTITUTION_POLICY",
  "COURSE_RECOMMENDATION_RULE",
  "TERMINOLOGY",
  "STUDENT_CONCERN_PATTERN",
  "COUNSELLOR_CORRECTION",
  "AVOIDANCE_RULE",
  "GENERAL_CONTEXT",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Who said it. Decides initial status, ranking authority, and what a vote may do. */
export const MEMORY_SOURCES = ["admin", "correction", "feedback", "extracted"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_STATUSES = ["candidate", "active", "deprecated", "deleted"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const HISTORY_EVENTS = [
  "created", "reinforced", "promoted", "deprecated", "reactivated", "deleted", "voted",
  "flagged", "edited", "conflict_flagged",
] as const;

/** What the counsellor DOES. The future animated counsellor maps these to behaviours. */
export const TECHNIQUES = [
  "clarify_first", "answer_then_ask", "compare_options", "explain_eligibility",
  "state_uncertainty", "structure_recommendation", "use_profile_fact", "show_course_cards",
  "withhold_recommendation", "request_missing_info", "escalate_to_human",
] as const;

export const SOURCE_AUTHORITY: Record<MemorySource, number> = { admin: 1, correction: 1, feedback: 0.5, extracted: 0.4 };
export const isHumanSource = (s: MemorySource): boolean => s === "admin" || s === "correction";

/** Types that describe HOW to respond; retrieval keeps a separate slot for them. */
export const TECHNIQUE_TYPES: ReadonlySet<MemoryType> = new Set<MemoryType>(["RESPONSE_PATTERN", "RESPONSE_PREFERENCE"]);

// ── Per-type metadata ────────────────────────────────────────────────────────

const Stage = z.enum(["exploring", "narrowing", "applying", "post_offer"]);
const Short = z.string().trim().min(1).max(300);

const meta = {
  COUNSELLING_GUIDELINE: z.object({ applies_to: z.array(Stage).max(4).optional() }),
  RESPONSE_PREFERENCE: z.object({
    tone: z.enum(["warm", "formal", "warm_formal", "casual"]).optional(),
    detail_level: z.enum(["brief", "standard", "detailed"]).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    use_cards: z.boolean().optional(),
  }),
  RESPONSE_PATTERN: z.object({ technique: z.enum(TECHNIQUES), trigger: Short, example: z.string().trim().max(600).optional() }),
  INSTITUTION_POLICY: z.object({ effective_until: z.string().date().optional(), url: z.string().url().max(500).optional() }),
  COURSE_RECOMMENDATION_RULE: z.object({
    prefer: z.array(Short).max(10).optional(),
    avoid: z.array(Short).max(10).optional(),
    destinations: z.array(z.string().trim().length(2)).max(10).optional(),
  }),
  TERMINOLOGY: z.object({ term: Short, meaning: Short, use_instead_of: z.array(Short).max(5).optional() }),
  STUDENT_CONCERN_PATTERN: z.object({ concern: Short, approach: Short }),
  COUNSELLOR_CORRECTION: z.object({
    message_id: z.number().int().positive(),
    original_excerpt: z.string().trim().max(600).optional(),
  }),
  AVOIDANCE_RULE: z.object({ severity: z.enum(["hard", "soft"]).default("hard") }),
  GENERAL_CONTEXT: z.object({}),
} satisfies Record<MemoryType, z.ZodTypeAny>;

export const METADATA_BY_TYPE: Record<MemoryType, z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>> = meta;

/** One atomic statement. 600 chars is a paragraph, not a document. */
const Content = z.string().trim().min(3).max(600);
const Base = z.object({
  content: Content,
  importance: z.number().int().min(1).max(5).default(3),
  expires_at: z.string().datetime().nullish(),
});
// Each member gets its schema passed explicitly: indexing `meta[type]` inside a generic yields a
// union of schemas whose `.default` signatures TypeScript cannot reconcile.
const opt = <T extends MemoryType, M extends z.ZodTypeAny>(type: T, m: M) =>
  Base.extend({ type: z.literal(type), metadata: m.default({}) });

/** Discriminated on `type` so a consumer switching on it gets typed metadata. */
export const CreateMemorySchema = z.discriminatedUnion("type", [
  opt("COUNSELLING_GUIDELINE", meta.COUNSELLING_GUIDELINE),
  opt("RESPONSE_PREFERENCE", meta.RESPONSE_PREFERENCE),
  opt("RESPONSE_PATTERN", meta.RESPONSE_PATTERN),
  opt("INSTITUTION_POLICY", meta.INSTITUTION_POLICY),
  opt("COURSE_RECOMMENDATION_RULE", meta.COURSE_RECOMMENDATION_RULE),
  opt("TERMINOLOGY", meta.TERMINOLOGY),
  opt("STUDENT_CONCERN_PATTERN", meta.STUDENT_CONCERN_PATTERN),
  opt("COUNSELLOR_CORRECTION", meta.COUNSELLOR_CORRECTION),
  opt("AVOIDANCE_RULE", meta.AVOIDANCE_RULE),
  opt("GENERAL_CONTEXT", meta.GENERAL_CONTEXT),
]);
export type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;

/** Admin edits. Type and source never change — a different type is a different memory. */
export const PatchMemorySchema = z.object({
  content: Content.optional(),
  importance: z.number().int().min(1).max(5).optional(),
  expires_at: z.string().datetime().nullish(),
  metadata: z.record(z.unknown()).optional(),
}).strict();
export type PatchMemoryInput = z.infer<typeof PatchMemorySchema>;

export const MemoryQuerySchema = z.object({
  status: z.enum(MEMORY_STATUSES).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  source: z.enum(MEMORY_SOURCES).optional(),
  flagged: z.coerce.boolean().optional(),
  /** Only candidates that contradict an existing memory — the review queue. */
  conflicting: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

// ── Provenance ───────────────────────────────────────────────────────────────

/** Hashed student identity (platform_user_id or visitor_key). Never a raw id or fingerprint. */
const ActorHash = z.string().regex(/^[a-f0-9]{16}$/);

export const ActorSchema = z.object({
  kind: z.enum(["admin", "counsellor", "student", "system"]),
  id: z.string().max(64).optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const SourceReferenceSchema = z.object({
  message_id: z.number().int().positive().optional(),
  session_id: z.number().int().positive().optional(),
  /** Distinct students whose conversations reinforced this memory. Promotion counts these. */
  actors: z.array(ActorHash).max(20).default([]),
  positive_voters: z.array(ActorHash).max(50).default([]),
  negative_voters: z.array(ActorHash).max(50).default([]),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const HistoryEntrySchema = z.object({
  at: z.string(),
  event: z.enum(HISTORY_EVENTS),
  reason: z.string().max(300).optional(),
  by: ActorSchema.optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

// ── Row (parsed on read; the vector never leaves the database) ───────────────

const Ts = z.coerce.date();
export const MemoryRowSchema = z.object({
  id: z.string().uuid(),
  institution_id: z.number().int(),
  type: z.enum(MEMORY_TYPES),
  content: z.string(),
  content_hash: z.string(),
  metadata: z.record(z.unknown()),
  source: z.enum(MEMORY_SOURCES),
  source_reference: SourceReferenceSchema,
  confidence: z.number().min(0).max(1),
  importance: z.number().int().min(1).max(5),
  status: z.enum(MEMORY_STATUSES),
  version: z.number().int().min(1),
  reinforce_count: z.number().int(),
  use_count: z.number().int(),
  has_embedding: z.boolean(),
  flagged_at: Ts.nullable(),
  /** Set on a learned candidate that contradicts this memory; blocks auto-promotion until a human decides. */
  conflicts_with_id: z.string().uuid().nullable(),
  history: z.array(HistoryEntrySchema),
  created_by: z.number().int().nullable(),
  created_at: Ts,
  updated_at: Ts,
  last_used_at: Ts.nullable(),
  expires_at: Ts.nullable(),
});
export type MemoryRow = z.infer<typeof MemoryRowSchema>;

// ── Learning ─────────────────────────────────────────────────────────────────

export const REVIEW_STATUSES = ["approved", "corrected", "flagged"] as const;
export const ReviewMessageSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES),
    correction: z.string().trim().min(1).max(4000).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.status !== "corrected" || !!v.correction, {
    message: "A correction is required when status is 'corrected'", path: ["correction"],
  });
export type ReviewMessageInput = z.infer<typeof ReviewMessageSchema>;

/** A queued learning job. institution_id is resolved by the publisher, never trusted from a client. */
export const LearnJobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("correction"), institution_id: z.number().int(), message_id: z.number().int().positive() }),
  z.object({ kind: z.literal("feedback"), institution_id: z.number().int(), message_id: z.number().int().positive() }),
  z.object({ kind: z.literal("conversation"), institution_id: z.number().int(), session_id: z.number().int().positive() }),
]);
export type LearnJob = z.infer<typeof LearnJobSchema>;

/** The extractor's output. Parsed, never repaired: a candidate that fails is discarded. */
export const ExtractionCandidateSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  content: Content,
  metadata: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  /** Names or refers to a specific person. Always rejected. */
  mentions_person: z.boolean(),
});
export const ExtractionOutputSchema = z.object({ candidates: z.array(ExtractionCandidateSchema).max(8) });
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

export const MemoryIdParamSchema = z.object({ id: z.string().uuid() });
