// Knex only. Every function takes the tenant Knex (`req.db`) as its first
// argument — the business is the schema, so there is no business_id predicate to
// forget and no way to reach another tenant's rows from here.
//
// EXPLICIT PROJECTIONS EVERYWHERE. A transcript is a verbatim recording of a
// counselling conversation; `select *` on that is how a column added next month
// leaks. No function in this file uses `select("*")` or a bare `.first()`.

import type { Knex } from "knex";
import type { PaginationInput } from "../../../shared/pagination.js";
import type { SessionStatus, Speaker } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const SESSION_COLUMNS = [
  "id",
  "counselor_id",
  "student_profile_id",
  "guest_name",
  "guest_phone",
  "status",
  "started_at",
  "ended_at",
  "duration_seconds",
  "language_detected",
  "created_at",
  "updated_at",
] as const;

/** The list view drops guest_phone: a history table does not need a phone number. */
export const SESSION_LIST_COLUMNS = SESSION_COLUMNS.filter((c) => c !== "guest_phone");

export const TRANSCRIPT_COLUMNS = [
  "id",
  "session_id",
  "speaker",
  "text",
  "translation",
  "chunk_index",
  "created_at",
] as const;

export const REVIEW_COLUMNS = [
  "id",
  "session_id",
  "counselor_notes",
  "action_items",
  "course_recommendations",
  "concerns",
  "full_summary",
  "saved_at",
  "generated_at",
  "created_at",
  "updated_at",
] as const;

export const COACHING_COLUMNS = [
  "id",
  "session_id",
  "running_summary",
  "suggested_questions",
  "flagged_concerns",
  "topics_covered",
  "topics_remaining",
  "created_at",
] as const;

export const CONSENT_COLUMNS = [
  "id",
  "session_id",
  "student_name",
  "student_id",
  "counselor_id",
  "consent_text",
  "consent_version",
  "locale",
  "created_at",
] as const;

export interface SessionRow {
  id: number;
  counselor_id: number;
  student_profile_id: number | null;
  guest_name: string | null;
  guest_phone?: string | null;
  status: SessionStatus;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  language_detected: string | null;
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function insertSession(
  db: Db,
  values: {
    counselor_id: number;
    student_profile_id: number | null;
    guest_name: string | null;
    guest_phone: string | null;
  },
): Promise<SessionRow> {
  const [row] = await db("scribe_sessions").insert(values).returning([...SESSION_COLUMNS]);
  return row as SessionRow;
}

/**
 * A session is only ever fetched together with its owning counsellor. A
 * colleague's counselling transcript is not business-wide reading material, so
 * the counsellor predicate is part of the lookup rather than a later check that
 * can be forgotten.
 */
export async function findOwnSession(
  db: Db,
  sessionId: number,
  counselorId: number,
): Promise<SessionRow | undefined> {
  return db("scribe_sessions")
    .where({ id: sessionId, counselor_id: counselorId })
    .first([...SESSION_COLUMNS]) as Promise<SessionRow | undefined>;
}

export async function listSessions(
  db: Db,
  counselorId: number,
  query: PaginationInput & { status?: SessionStatus; student_profile_id?: number },
): Promise<{ rows: SessionRow[]; total: number }> {
  const base = () => {
    const q = db("scribe_sessions").where({ counselor_id: counselorId });
    if (query.status) q.andWhere({ status: query.status });
    if (query.student_profile_id) q.andWhere({ student_profile_id: query.student_profile_id });
    return q;
  };

  const [rows, counted] = await Promise.all([
    base()
      .orderBy("created_at", "desc")
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .select([...SESSION_LIST_COLUMNS]),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows: rows as SessionRow[], total: Number(counted?.count ?? 0) };
}

export async function updateSession(
  db: Db,
  sessionId: number,
  counselorId: number,
  values: Record<string, unknown>,
): Promise<SessionRow | undefined> {
  const [row] = await db("scribe_sessions")
    .where({ id: sessionId, counselor_id: counselorId })
    .update({ ...values, updated_at: db.fn.now() })
    .returning([...SESSION_COLUMNS]);
  return row as SessionRow | undefined;
}

/** Honest counts for the dashboard, including the work still waiting. */
export async function sessionStats(db: Db, counselorId: number) {
  const row = await db("scribe_sessions")
    .where({ counselor_id: counselorId })
    .select(
      db.raw(
        `count(*) AS total,
         count(*) FILTER (WHERE status = 'active')   AS active,
         count(*) FILTER (WHERE status = 'ended')    AS pending_review,
         count(*) FILTER (WHERE status = 'reviewed') AS reviewed`,
      ),
    )
    .first();
  const n = (v: unknown) => Number(v ?? 0);
  return {
    total: n((row as Record<string, unknown>)?.total),
    active: n((row as Record<string, unknown>)?.active),
    pending_review: n((row as Record<string, unknown>)?.pending_review),
    reviewed: n((row as Record<string, unknown>)?.reviewed),
  };
}

// ── Consent ─────────────────────────────────────────────────────────────────

export async function insertConsent(
  db: Db,
  values: {
    session_id: number;
    student_name: string;
    student_id: number | null;
    counselor_id: number;
    consent_text: string;
    consent_version: string;
    locale: string | null;
    ip_address: string | null;
    user_agent: string | null;
  },
) {
  const [row] = await db("scribe_consent_log").insert(values).returning([...CONSENT_COLUMNS]);
  return row;
}

export async function findConsent(db: Db, sessionId: number) {
  return db("scribe_consent_log").where({ session_id: sessionId }).first([...CONSENT_COLUMNS]);
}

// ── Transcripts ─────────────────────────────────────────────────────────────

/**
 * Upsert on (session_id, chunk_index) — V2's unique key. A retried upload of
 * chunk 7 replaces chunk 7. V1 let the browser insert with a client-held counter
 * that reset to 0 on retry, so the unique violation silently dropped lines
 * (defect D-E3-5).
 */
export async function upsertTranscripts(
  db: Db,
  sessionId: number,
  chunks: { chunk_index: number; speaker: Speaker; text: string; translation?: string | null }[],
) {
  return db("scribe_transcripts")
    .insert(
      chunks.map((c) => ({
        session_id: sessionId,
        chunk_index: c.chunk_index,
        speaker: c.speaker,
        text: c.text,
        translation: c.translation ?? null,
      })),
    )
    .onConflict(["session_id", "chunk_index"])
    .merge(["speaker", "text", "translation"])
    .returning([...TRANSCRIPT_COLUMNS]);
}

export async function listTranscripts(db: Db, sessionId: number) {
  return db("scribe_transcripts")
    .where({ session_id: sessionId })
    .orderBy("chunk_index", "asc")
    .select([...TRANSCRIPT_COLUMNS]);
}

export async function updateTranslation(
  db: Db,
  sessionId: number,
  chunkIndex: number,
  translation: string,
) {
  const [row] = await db("scribe_transcripts")
    .where({ session_id: sessionId, chunk_index: chunkIndex })
    .update({ translation })
    .returning([...TRANSCRIPT_COLUMNS]);
  return row;
}

export async function findTranscriptChunk(db: Db, sessionId: number, chunkIndex: number) {
  return db("scribe_transcripts")
    .where({ session_id: sessionId, chunk_index: chunkIndex })
    .first([...TRANSCRIPT_COLUMNS]);
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export async function findReview(db: Db, sessionId: number) {
  return db("scribe_reviews").where({ session_id: sessionId }).first([...REVIEW_COLUMNS]);
}

export async function insertReview(
  db: Db,
  values: {
    session_id: number;
    full_summary: string | null;
    action_items: unknown;
    course_recommendations: unknown;
    concerns: unknown;
  },
) {
  const [row] = await db("scribe_reviews")
    .insert({
      session_id: values.session_id,
      full_summary: values.full_summary,
      action_items: JSON.stringify(values.action_items),
      course_recommendations: JSON.stringify(values.course_recommendations),
      concerns: JSON.stringify(values.concerns),
    })
    .returning([...REVIEW_COLUMNS]);
  return row;
}

export async function updateReview(db: Db, sessionId: number, values: Record<string, unknown>) {
  const [row] = await db("scribe_reviews")
    .where({ session_id: sessionId })
    .update({ ...values, updated_at: db.fn.now() })
    .returning([...REVIEW_COLUMNS]);
  return row;
}

// ── Coaching snapshots ──────────────────────────────────────────────────────

export async function insertCoachingSnapshot(
  db: Db,
  values: {
    session_id: number;
    running_summary: string | null;
    suggested_questions: unknown;
    flagged_concerns: unknown;
    topics_covered: unknown;
    topics_remaining: unknown;
  },
) {
  const [row] = await db("scribe_coaching_snapshots")
    .insert({
      session_id: values.session_id,
      running_summary: values.running_summary,
      suggested_questions: JSON.stringify(values.suggested_questions),
      flagged_concerns: JSON.stringify(values.flagged_concerns),
      topics_covered: JSON.stringify(values.topics_covered),
      topics_remaining: JSON.stringify(values.topics_remaining),
    })
    .returning([...COACHING_COLUMNS]);
  return row;
}

export async function listCoachingSnapshots(db: Db, sessionId: number, limit: number) {
  return db("scribe_coaching_snapshots")
    .where({ session_id: sessionId })
    .orderBy("created_at", "desc")
    .limit(limit)
    .select([...COACHING_COLUMNS]);
}
