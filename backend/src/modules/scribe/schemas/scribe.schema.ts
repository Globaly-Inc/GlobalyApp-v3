// Zod schemas for scribe. Bodies are `.strict()` for the same reason as
// training and ambassadors: the owning ids (business = the tenant schema,
// counselor_id = req.auth.sub) are never accepted from a body, and a strict body
// turns an attempt to supply one into a 400 instead of a silent override.
//
// V1 accepted `business_id` in the scribe-consent and scribe-coaching bodies and
// authorised against it. That is gone: the business is the tenant schema.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  ACTION_ITEM_OWNERS,
  CONCERN_SEVERITIES,
  MAX_CHUNKS_PER_WRITE,
  MAX_TRANSCRIPT_TEXT_CHARS,
  SESSION_STATUSES,
  SPEAKERS,
} from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const ChunkParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  chunkIndex: z.coerce.number().int().min(0),
});

// ── Starting a session (V1 scribe-consent) ──────────────────────────────────
//
// Consent is not a side effect here — it is the body. A session cannot be
// created without it, because V1's consent row was advisory: nothing downstream
// ever checked one existed before transcribing (defect D-E3-1).

export const StartSessionSchema = z
  .object({
    /** The account being counselled, when they have one. */
    student_profile_id: z.number().int().positive().nullable().optional(),
    /** A walk-in with no account. */
    guest_name: z.string().min(1).max(200).nullable().optional(),
    guest_phone: z.string().min(1).max(60).nullable().optional(),
    consent: z
      .object({
        /** Verbatim, as spoken or typed at the time. Never joined from a profile. */
        student_name: z.string().min(1).max(200),
        /** The wording actually shown to the student. Stored as evidence. */
        consent_text: z.string().min(1).max(8000),
        locale: z.string().max(35).nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => Boolean(v.student_profile_id) || Boolean(v.guest_name), {
    message: "Either student_profile_id or guest_name is required",
  });

export const ListSessionsQuerySchema = PaginationSchema.extend({
  status: z.enum(SESSION_STATUSES).optional(),
  student_profile_id: z.coerce.number().int().positive().optional(),
});

// ── Transcript chunks ───────────────────────────────────────────────────────
//
// The SERVER writes these. In V1 the browser inserted straight into
// scribe_transcripts under its own JWT with a client-held counter, so a retry
// reset the counter to 0, collided on UNIQUE (session_id, chunk_index), and the
// unchecked error silently dropped lines that still showed in the UI
// (defect D-E3-5). Here the write is an upsert on that same key: a retried
// chunk 7 replaces chunk 7 and can never become a second copy of the same speech.

export const PutTranscriptsSchema = z
  .object({
    chunks: z
      .array(
        z
          .object({
            chunk_index: z.number().int().min(0),
            speaker: z.enum(SPEAKERS),
            text: z.string().min(1).max(MAX_TRANSCRIPT_TEXT_CHARS),
            translation: z.string().max(MAX_TRANSCRIPT_TEXT_CHARS).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CHUNKS_PER_WRITE),
  })
  .strict()
  .refine(
    (v) => new Set(v.chunks.map((c) => c.chunk_index)).size === v.chunks.length,
    { message: "chunk_index must be unique within one request" },
  );

// ── Ending a session ────────────────────────────────────────────────────────
//
// `duration_seconds` comes from the recorder, because it is recording time. V1
// computed `now - started_at` inside scribe-review, which billed the counsellor's
// time on the review screen as session duration (defect D-E3-6).

export const EndSessionSchema = z
  .object({
    duration_seconds: z.number().int().min(0).max(86_400).optional(),
    language_detected: z.string().max(120).nullable().optional(),
  })
  .strict();

// ── Saving the counsellor-approved review (V1 scribe-save) ──────────────────
//
// V1 wrote `action_items`/`concerns`/`course_recommendations` as unvalidated
// `unknown[]` straight into jsonb, which is why the V1 UI has to
// `Array.isArray()` everything it reads back and why a model returning
// `severity: null` threw in render. Validated here (defect D-E3-7).

const ActionItemSchema = z
  .object({
    task: z.string().min(1).max(2000),
    owner: z.enum(ACTION_ITEM_OWNERS),
    deadline: z.string().max(60).nullable().optional(),
  })
  .strict();

const CourseRecommendationSchema = z
  .object({
    name: z.string().min(1).max(500),
    institution: z.string().max(500).nullable().optional(),
    reason: z.string().max(4000).nullable().optional(),
  })
  .strict();

const ConcernSchema = z
  .object({
    concern: z.string().min(1).max(4000),
    severity: z.enum(CONCERN_SEVERITIES),
  })
  .strict();

export const SaveReviewSchema = z
  .object({
    counselor_notes: z.string().max(20_000).nullable().optional(),
    full_summary: z.string().max(40_000).nullable().optional(),
    action_items: z.array(ActionItemSchema).max(100).optional(),
    course_recommendations: z.array(CourseRecommendationSchema).max(100).optional(),
    concerns: z.array(ConcernSchema).max(100).optional(),
  })
  .strict();

/** The AI draft is held to the same shape before it is stored. */
export const GeneratedReviewSchema = z
  .object({
    full_summary: z.string().max(40_000).nullish(),
    action_items: z.array(ActionItemSchema).max(100).default([]),
    course_recommendations: z.array(CourseRecommendationSchema).max(100).default([]),
    concerns: z.array(ConcernSchema).max(100).default([]),
  })
  .passthrough();

export const GeneratedCoachingSchema = z
  .object({
    running_summary: z.string().max(20_000).nullish(),
    suggested_questions: z.array(z.string().max(2000)).max(20).default([]),
    flagged_concerns: z.array(z.string().max(2000)).max(20).default([]),
    topics_covered: z.array(z.string().max(500)).max(50).default([]),
    topics_remaining: z.array(z.string().max(500)).max(50).default([]),
  })
  .passthrough();
