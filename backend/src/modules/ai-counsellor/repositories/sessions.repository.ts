import { masterKnex } from "../../../core/db/master-pool.js";

/**
 * What the counsellor has learned in conversation, as opposed to what the student
 * filled into a form. Deliberately a small fixed set of keys: an open-ended shape
 * would drift into whatever the model felt like writing that turn, and nothing
 * downstream could read it reliably.
 */
export interface CounsellingContext {
  /** What they want out of it — career or study outcome, in their words. */
  goals?: string[];
  interests?: string[];
  strengths?: string[];
  /** Budget, family, timing, location, anything limiting the options. */
  constraints?: string[];
  preferred_countries?: string[];
  /** Where they are in the journey. Drives how directive the counsellor should be. */
  stage?: "exploring" | "narrowing" | "applying" | "post_offer";
  /** Anything worth carrying that has no home above. */
  notes?: string[];
}

/** Per-key cap: the context is injected into every prompt, so it cannot grow forever. */
const MAX_ITEMS_PER_KEY = 8;

const LIST_KEYS = [
  "goals", "interests", "strengths", "constraints", "preferred_countries", "notes",
] as const satisfies ReadonlyArray<keyof CounsellingContext>;

/**
 * Merge a tool-supplied patch into the stored context.
 *
 * Lists union (case-insensitively deduped, newest last, capped); `stage` overwrites,
 * because a student is in one stage at a time and the latest read wins. Nothing is
 * ever removed by a merge — the model correcting itself replaces the stage, and stale
 * list items age out through the cap rather than by deletion.
 */
export function mergeCounsellingContext(
  current: CounsellingContext | null | undefined,
  patch: CounsellingContext,
): CounsellingContext {
  const merged: CounsellingContext = { ...(current ?? {}) };

  for (const key of LIST_KEYS) {
    const incoming = patch[key];
    if (!incoming?.length) continue;
    const seen = new Set<string>();
    const items: string[] = [];
    for (const raw of [...(merged[key] ?? []), ...incoming]) {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue;
      const fingerprint = value.toLowerCase();
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      items.push(value);
    }
    // Keep the most recent when over the cap — later turns are better informed.
    merged[key] = items.slice(-MAX_ITEMS_PER_KEY);
  }

  if (patch.stage) merged.stage = patch.stage;
  return merged;
}

/** A chat's (or a contact's) staff-facing summary, as stored. */
export interface ChatSummaryJson {
  /** "contact" on the visitor's whole-person summary; absent on a chat's own. */
  kind?: "contact";
  title?: string | null;
  text: string | null;
  open?: string[];
  next_step?: string | null;
  program?: { name: string; city?: string | null } | null;
  topics?: string[];
  /** Contact summaries only: how many summarised chats and stated profile details it was built from. */
  chat_count?: number;
  detail_count?: number;
  generated_at: string;
}

export interface SessionRow {
  id: number;
  /** Null on an embed-widget visitor's thread — `visitor_key` owns it instead. */
  platform_user_id: number | null;
  visitor_key: string | null;
  embed_config_id: number | null;
  title: string | null;
  message_count: number;
  credits_used: number;
  is_archived: boolean;
  /** A widget chat the visitor ended (20261002_003). Absent on a database behind it. */
  ended_at?: Date | null;
  /** That chat's staff-facing summary. */
  summary?: ChatSummaryJson | null;
  /** Newest visitor message a resume has claimed (20261002_004). Absent on a database behind it. */
  answered_through_message_id?: number | null;
  counselling_context: CounsellingContext;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const TABLE = "ai_counselor_sessions";

// The list endpoint renders titles. counselling_context is deliberately absent: it
// grows with the conversation and the sidebar has no use for it.
const LIST_COLUMNS = [
  "id", "platform_user_id", "visitor_key", "embed_config_id", "title", "message_count",
  "credits_used", "is_archived", "created_at", "updated_at", "deleted_at",
];

export async function create(userId: number, embedConfigId?: number): Promise<SessionRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ platform_user_id: userId, embed_config_id: embedConfigId ?? null })
    .returning("*");
  return row;
}

export async function findById(id: number): Promise<SessionRow | undefined> {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

/**
 * The anonymous widget visitor's live thread for ONE embed config, created on first
 * message. Keyed on (visitor_key, embed_config_id) — the same browser talking to two
 * universities' widgets gets two threads, and neither can read the other.
 *
 * `embedConfigId` is required, not optional: a visitor_key only ever means something
 * inside a widget, and defaulting it to null would collapse every university's thread
 * for that browser into one row.
 */
export async function findByVisitor(
  visitorKey: string,
  embedConfigId: number,
): Promise<SessionRow | undefined> {
  return masterKnex(TABLE)
    .where({ visitor_key: visitorKey, embed_config_id: embedConfigId })
    .whereNull("deleted_at")
    // The OPEN chat only — an ended one is never resumed; the visitor's next message starts fresh.
    .whereNull("ended_at")
    .first();
}

/** The visitor ended the chat: close it, so their next visit starts a new one. */
export async function endVisitorSession(visitorKey: string, embedConfigId: number): Promise<number | null> {
  const [row] = await masterKnex(TABLE)
    .where({ visitor_key: visitorKey, embed_config_id: embedConfigId })
    .whereNull("deleted_at")
    .whereNull("ended_at")
    .update({ ended_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() })
    .returning("id");
  return row?.id ?? null;
}

/** Reopen an ended chat — a staff reply after the end, so it reaches the visitor's next visit. */
export async function reopenSession(id: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ ended_at: null, updated_at: masterKnex.fn.now() });
}

export interface VisitorChat {
  id: number;
  created_at: Date;
  updated_at: Date;
  ended_at: Date | null;
  message_count: number;
  summary: ChatSummaryJson | null;
}

/** Every chat this visitor had with this widget, oldest first. */
export async function findChatsByVisitor(visitorKey: string, embedConfigId: number): Promise<VisitorChat[]> {
  return masterKnex(TABLE)
    .where({ visitor_key: visitorKey, embed_config_id: embedConfigId })
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
    .select("id", "created_at", "updated_at", "ended_at", "message_count", "summary");
}

/** Save a chat summary only if the chat hasn't moved on while it was written (see refreshChatSummary). */
export async function saveSummaryIfUnchanged(id: number, messageCount: number, summary: ChatSummaryJson): Promise<boolean> {
  return (await masterKnex(TABLE).where({ id, message_count: messageCount }).update({ summary: JSON.stringify(summary) })) > 0;
}

export async function createForVisitor(
  visitorKey: string,
  embedConfigId: number,
): Promise<SessionRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ visitor_key: visitorKey, embed_config_id: embedConfigId, platform_user_id: null })
    .returning("*");
  return row;
}

/**
 * Hand a visitor's thread to the account they just created: the whole conversation
 * carries over by changing owner, with no message copying. The one-owner CHECK means
 * visitor_key has to be cleared in the same statement.
 */
export async function adoptVisitorSession(
  visitorKey: string,
  embedConfigId: number,
  userId: number,
): Promise<SessionRow | undefined> {
  // ponytail: only the open chat moves to the account; ended chats stay with the visitor record.
  const [row] = await masterKnex(TABLE)
    .where({ visitor_key: visitorKey, embed_config_id: embedConfigId })
    .whereNull("deleted_at")
    .whereNull("ended_at")
    .update({ platform_user_id: userId, visitor_key: null, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/** Sessions this user has ever had (archived included) — drives the returning-user greeting. */
export async function countByUser(userId: number): Promise<number> {
  const row = await masterKnex(TABLE)
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .count("* as c")
    .first();
  return Number(row?.c ?? 0);
}

export async function findByUser(
  userId: number,
  includeArchived: boolean,
): Promise<Array<Omit<SessionRow, "counselling_context">>> {
  const q = masterKnex(TABLE)
    .select(LIST_COLUMNS)
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");
  if (!includeArchived) q.andWhere({ is_archived: false });
  return q;
}

export async function update(
  id: number,
  patch: Partial<Pick<SessionRow, "title" | "is_archived">>,
): Promise<SessionRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/**
 * Read-merge-write the session's counselling context.
 *
 * ponytail: not transactional. One turn runs at a time per session, so the read and
 * the write cannot interleave with another turn's. Wrap in a transaction with SELECT
 * FOR UPDATE if concurrent writers ever become real (parallel tool calls in one turn
 * are already serialised by the agent loop).
 */
export async function mergeContext(
  id: number,
  patch: CounsellingContext,
): Promise<CounsellingContext> {
  const row = await masterKnex(TABLE).where({ id }).first();
  const merged = mergeCounsellingContext(row?.counselling_context, patch);
  await masterKnex(TABLE)
    .where({ id })
    .update({ counselling_context: JSON.stringify(merged), updated_at: masterKnex.fn.now() });
  return merged;
}

/**
 * Claim the visitor's unanswered questions up to `lastMessageId` for one resume. A single UPDATE,
 * so of two concurrent resumes exactly one gets `true`; the claim stays after the request ends.
 */
export async function claimAnsweredThrough(id: number, lastMessageId: number): Promise<boolean> {
  try {
    const n = await masterKnex(TABLE)
      .where({ id })
      .where((q) => q.whereNull("answered_through_message_id").orWhere("answered_through_message_id", "<", lastMessageId))
      .update({ answered_through_message_id: lastMessageId });
    return n > 0;
  } catch {
    // A database behind 20261002_004: answer unclaimed rather than fail the visitor's reply.
    return true;
  }
}

/** Undo a claim whose reply never got saved, so the next resume answers those questions. Only
 *  while the claim is still this one — a later resume's claim is left alone. */
export async function releaseAnsweredThrough(id: number, claimed: number, previous: number | null): Promise<void> {
  await masterKnex(TABLE)
    .where({ id, answered_through_message_id: claimed })
    .update({ answered_through_message_id: previous })
    .catch(() => {}); // a database behind 20261002_004 never claimed anything
}

export async function incrementMessageCount(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ message_count: masterKnex.raw("message_count + 1"), updated_at: masterKnex.fn.now() });
}

/** Hard delete — messages cascade via FK, and the credit ledger keeps its rows
 * (credit_transactions.reference_id is a soft reference, no FK). Soft delete was
 * dropped deliberately: chat transcripts are bulky and nothing un-deletes them. */
export async function hardDelete(id: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).del();
}
