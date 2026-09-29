// What the learning pipeline reads from and writes to outside its own table: messages, sessions,
// the widget config, and the names the PII filter must recognise.

import { masterKnex } from "../../../core/db/master-pool.js";
import { tenantDbFor } from "../../ai-counsellor/services/visitor.service.js";
import type { EmbedConfigRow } from "../../ai-counsellor/repositories/embed.repository.js";
import type { ReviewMessageInput } from "../schemas/memory.schema.js";

export interface LearnMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  feedback: "positive" | "negative" | null;
  feedback_actor: string | null;
  review_status: "approved" | "corrected" | "flagged" | null;
  correction: string | null;
  review_note: string | null;
  reviewed_by: number | null;
  reviewed_at?: Date | null;
  memory_ids: string[];
  feedback_learned_at?: Date | null;
  review_learned_at?: Date | null;
}

export interface LearnSession {
  id: number;
  platform_user_id: number | null;
  visitor_key: string | null;
  embed_config_id: number | null;
}

const MESSAGE_COLUMNS = [
  "id", "session_id", "role", "content", "feedback", "feedback_actor", "review_status",
  "correction", "review_note", "reviewed_by", "reviewed_at", "memory_ids",
  "feedback_learned_at", "review_learned_at",
];

export async function findMessage(id: number): Promise<LearnMessage | undefined> {
  return masterKnex("ai_counselor_messages").select(MESSAGE_COLUMNS).where({ id }).first();
}

/** Oldest-first transcript, capped — the tail is where a conversation gets specific. */
export async function findTranscript(sessionId: number, limit = 40): Promise<LearnMessage[]> {
  const rows: LearnMessage[] = await masterKnex("ai_counselor_messages").select(MESSAGE_COLUMNS)
    .where({ session_id: sessionId })
    .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
    .limit(limit);
  return rows.reverse();
}

/** The user message the assistant message answered — the one just before it. */
export async function findQuestionFor(message: LearnMessage): Promise<string | null> {
  const row = await masterKnex("ai_counselor_messages").select("content")
    .where({ session_id: message.session_id, role: "user" }).where("id", "<", message.id)
    .orderBy("id", "desc").first();
  return row?.content ?? null;
}

export async function findSession(id: number): Promise<LearnSession | undefined> {
  return masterKnex("ai_counselor_sessions").select("id", "platform_user_id", "visitor_key", "embed_config_id")
    .where({ id }).whereNull("deleted_at").first();
}

export async function findEmbedConfig(id: number): Promise<EmbedConfigRow | undefined> {
  return masterKnex("ai_embed_configs").where({ id }).first();
}

/** The institution a session's widget belongs to, or null (platform chat, business widget). */
export async function institutionForSession(session: LearnSession): Promise<{ institutionId: number; config: EmbedConfigRow } | null> {
  if (!session.embed_config_id) return null;
  const config = await findEmbedConfig(session.embed_config_id);
  if (!config || config.institution_id == null) return null;
  return { institutionId: Number(config.institution_id), config };
}

/** Names the PII filter must catch: the student's own and any they typed into their profile. */
export async function knownNames(session: LearnSession, config: EmbedConfigRow | null): Promise<string[]> {
  const names: string[] = [];
  if (session.platform_user_id) {
    const u = await masterKnex("platform_users").select("first_name", "last_name").where({ id: session.platform_user_id }).first();
    if (u) names.push(u.first_name, u.last_name);
    const quals = await masterKnex("platform_user_qualifications").select("institution_name")
      .where({ user_id: session.platform_user_id }).whereNull("deleted_at");
    for (const q of quals) if (q.institution_name) names.push(q.institution_name);
  }
  if (session.visitor_key && config) {
    // Visitor rows live in the tenant schema; unprovisioned tenants simply have none.
    const db = await tenantDbFor(config).catch(() => null);
    const v = db ? await db("ai_widget_visitors").select("name").where({ session_id: session.id }).first().catch(() => null) : null;
    if (v?.name) names.push(v.name);
  }
  return names.map((n) => String(n).trim()).filter((n) => n.length >= 2);
}

// ── Institution review surface ───────────────────────────────────────────────

export interface ReviewSession {
  id: number;
  embed_config_id: number;
  title: string | null;
  message_count: number;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  /** Replies still without a review, so the queue can be sorted by what needs eyes. */
  unreviewed: number;
  flagged: number;
}

/** Threads on this institution's widgets, newest activity first. Visitor identity is not returned. */
export async function findSessionsForConfigs(configIds: number[], opts: { limit: number; unreviewedOnly?: boolean }): Promise<ReviewSession[]> {
  if (!configIds.length) return [];
  const q = masterKnex("ai_counselor_sessions as s")
    .select("s.id", "s.embed_config_id", "s.title", "s.message_count", "s.is_archived", "s.created_at", "s.updated_at")
    .select(masterKnex.raw(`(SELECT count(*)::int FROM ai_counselor_messages m WHERE m.session_id = s.id AND m.role = 'assistant' AND m.review_status IS NULL) AS unreviewed`))
    .select(masterKnex.raw(`(SELECT count(*)::int FROM ai_counselor_messages m WHERE m.session_id = s.id AND m.feedback = 'negative') AS flagged`))
    .whereIn("s.embed_config_id", configIds)
    .whereNull("s.deleted_at")
    .where("s.message_count", ">", 0)
    .orderBy("s.updated_at", "desc")
    .limit(opts.limit);
  if (opts.unreviewedOnly) {
    q.whereExists(masterKnex("ai_counselor_messages as m").whereRaw("m.session_id = s.id").where({ "m.role": "assistant" }).whereNull("m.review_status"));
  }
  return q;
}

export interface ReviewMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards: unknown[];
  feedback: "positive" | "negative" | null;
  review_status: "approved" | "corrected" | "flagged" | null;
  correction: string | null;
  review_note: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  memory_ids: string[];
  created_at: Date;
}

/** One thread for review, oldest first. Only when the session is on one of the given widgets. */
export async function findMessagesForReview(sessionId: number, configIds: number[]): Promise<ReviewMessage[] | null> {
  if (!configIds.length) return null;
  const session = await masterKnex("ai_counselor_sessions").select("id").where({ id: sessionId }).whereIn("embed_config_id", configIds).whereNull("deleted_at").first();
  if (!session) return null;
  return masterKnex("ai_counselor_messages")
    .select("id", "role", "content", "cards", "feedback", "review_status", "correction", "review_note", "reviewed_by", "reviewed_at", "memory_ids", "created_at")
    .where({ session_id: sessionId })
    .orderBy([{ column: "created_at", order: "asc" }, { column: "id", order: "asc" }]);
}

export async function recordReview(messageId: number, review: ReviewMessageInput, reviewerId: number): Promise<void> {
  await masterKnex("ai_counselor_messages").where({ id: messageId }).update({
    review_status: review.status,
    correction: review.correction ?? null,
    review_note: review.note ?? null,
    reviewed_by: reviewerId,
    reviewed_at: masterKnex.fn.now(),
    // A new review is a new signal: an earlier one's marker must not hide it from recovery.
    review_learned_at: null,
  });
}

export async function recordFeedback(messageId: number, feedback: "positive" | "negative" | null, actorHash: string): Promise<void> {
  await masterKnex("ai_counselor_messages").where({ id: messageId }).update({ feedback, feedback_actor: actorHash, feedback_learned_at: null });
}

/** Which memories shaped a reply — the chat tool calls this after persisting the assistant message. */
export async function recordMemoryIds(messageId: number, ids: string[]): Promise<void> {
  await masterKnex("ai_counselor_messages").where({ id: messageId }).update({ memory_ids: JSON.stringify(ids) });
}

/** Which marker column a learn job clears. A thumb and a review are independent signals on the
 *  same message, learned from by different jobs, so each has its own — stamping one must never
 *  hide the other from recovery. */
export type LearnedMarker = "feedback" | "review";
const MARKER_COLUMN: Record<LearnedMarker, string> = {
  feedback: "feedback_learned_at",
  review: "review_learned_at",
};

/** Stamped once a learn job for this signal has actually run, so the sweep below can tell a
 *  signal that was already learned from apart from one whose job never reached the broker. */
/**
 * `observed` is the signal AS THE JOB READ IT, and the stamp only lands if it is still that.
 *
 * Without this the stamp says "a job for this message finished", not "this version of the signal
 * was learned from". A job already in flight when someone changes their thumb (or re-reviews)
 * would clear-then-restamp the marker it never processed: `recordFeedback`/`recordReview` null
 * the marker to re-expose the new signal, the older job stamps it anyway, and if the newer job's
 * publish was lost the sweep sees "learned" and never applies it (Greptile).
 *
 * Version token per signal: the thumb's own value, and `reviewed_at`, which `recordReview`
 * refreshes on every write. Knex renders a null binding as `is null`, so a cleared thumb
 * compares correctly. Returns the rows stamped — 0 means the signal moved on and the sweep
 * should (and will) pick it up again.
 */
export async function markLearned(
  messageId: number,
  marker: LearnedMarker,
  observed: Pick<LearnMessage, "feedback" | "reviewed_at">,
): Promise<number> {
  const guard = marker === "feedback"
    ? { feedback: observed.feedback ?? null }
    : { reviewed_at: observed.reviewed_at ?? null };
  return masterKnex("ai_counselor_messages").where({ id: messageId }).where(guard)
    .update({ [MARKER_COLUMN[marker]]: masterKnex.fn.now() });
}

/**
 * Signals that were accepted and persisted but never learned from — the recovery set for a
 * broker outage. Ordered oldest-first so a backlog drains in the order it happened.
 *
 * `graceMinutes` is what keeps this from racing the ordinary path: a job published seconds ago
 * is still legitimately in flight, and re-enqueuing it would double-learn. Only rows older than
 * the window are considered abandoned.
 */
export async function findUnlearnedSignals(graceMinutes: number, limit: number): Promise<LearnMessage[]> {
  return masterKnex("ai_counselor_messages")
    .select(MESSAGE_COLUMNS)
    // Per signal, not per row: a message whose review was learned from can still be carrying a
    // thumb whose job never reached the broker, and vice versa.
    .where((qb) => qb
      .where((f) => f.whereNotNull("feedback").whereNull("feedback_learned_at"))
      .orWhere((r) => r.whereNotNull("review_status").whereNull("review_learned_at")))
    .whereRaw(`created_at < now() - interval '${graceMinutes} minutes'`)
    .orderBy("created_at", "asc")
    .limit(limit);
}
