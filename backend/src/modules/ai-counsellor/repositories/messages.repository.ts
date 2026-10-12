import { masterKnex } from "../../../core/db/master-pool.js";

/** `agent` is a staff member who took a widget chat over (20261001_001); the server sets it. */
export type MessageRole = "user" | "assistant" | "agent";

export interface MessageRow {
  id: number;
  session_id: number;
  role: MessageRole;
  content: string;
  sources: unknown[];
  cards: unknown[];
  chips: unknown[];
  blocks: unknown[];
  attachments: unknown[];
  feedback: "positive" | "negative" | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  /** Agent rows only — a snapshot of the staff member's name, so the public widget never joins. */
  sender_name: string | null;
  created_at: Date;
  /** Channel conversations only (20261008_001), and only in INBOX_COLUMNS reads. */
  delivery_status?: DeliveryStatus | null;
  delivery_error?: string | null;
  sent_from?: "phone_app" | null;
  sender_deleted_at?: Date | null;
}

export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

const TABLE = "ai_counselor_messages";

// What a student may see. The review, feedback_actor and memory_ids columns added by
// 20260925_001 are internal to the learning pipeline and never leave through this list.
const STUDENT_COLUMNS = [
  "id", "session_id", "role", "content", "sources", "cards", "chips", "blocks", "attachments",
  "feedback", "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "sender_name", "created_at",
];

// The staff Inbox also sees how a channel message travelled (20261008_001). Never the public
// widget: delivery bookkeeping is the business's, not the visitor's.
const INBOX_COLUMNS = [...STUDENT_COLUMNS, "delivery_status", "delivery_error", "sent_from", "sender_deleted_at"];

export async function create(data: {
  session_id: number;
  role: MessageRole;
  content: string;
  /** Required for role "agent", forbidden otherwise — CHECK ai_messages_agent_sender_check. */
  sender_user_id?: number;
  sender_name?: string;
  sources?: unknown[];
  cards?: unknown[];
  chips?: unknown[];
  blocks?: unknown[];
  attachments?: unknown[];
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  /** Institution memories that shaped this reply — feedback learns against exactly these.
   * Only written when present, so the column default holds and a DB behind the
   * 20260925_001 migration is not asked for a column it lacks. */
  memory_ids?: string[];
  /** Channel conversations (20261008_001). Each is only written when present, so the widget's
   * inserts never name a column a database behind that migration lacks. */
  provider_message_id?: string;
  delivery_status?: DeliveryStatus;
  delivery_error?: string;
  sent_from?: "phone_app";
}): Promise<MessageRow> {
  const [row] = await masterKnex(TABLE)
    .insert({
      session_id: data.session_id,
      role: data.role,
      content: data.content,
      sources: JSON.stringify(data.sources ?? []),
      cards: JSON.stringify(data.cards ?? []),
      chips: JSON.stringify(data.chips ?? []),
      blocks: JSON.stringify(data.blocks ?? []),
      attachments: JSON.stringify(data.attachments ?? []),
      prompt_tokens: data.prompt_tokens ?? null,
      completion_tokens: data.completion_tokens ?? null,
      total_tokens: data.total_tokens ?? null,
      latency_ms: data.latency_ms ?? null,
      ...(data.sender_name ? { sender_user_id: data.sender_user_id ?? null, sender_name: data.sender_name } : {}),
      ...(data.memory_ids?.length ? { memory_ids: JSON.stringify(data.memory_ids) } : {}),
      ...(data.provider_message_id ? { provider_message_id: data.provider_message_id } : {}),
      ...(data.delivery_status ? { delivery_status: data.delivery_status } : {}),
      ...(data.delivery_error ? { delivery_error: data.delivery_error } : {}),
      ...(data.sent_from ? { sent_from: data.sent_from } : {}),
    })
    .returning("*");
  return row;
}

/**
 * The most recent `limit` messages, returned oldest-first.
 *
 * Ordering is DESC in SQL and reversed in memory. `ASC + LIMIT` took the OLDEST rows,
 * so once a session passed the limit the model's history window froze on the opening
 * turns and never saw recent ones — and chat.service's `slice(0, -1)`, which assumes
 * the just-persisted user message is last, then stripped a real message instead.
 *
 * `id DESC` breaks `created_at` ties: the new user message and the previous assistant
 * message can land in the same timestamp tick, and that `slice(0, -1)` needs the newest
 * row to be last deterministically.
 */
export async function findBySession(
  sessionId: number,
  opts: { limit?: number } = {},
): Promise<MessageRow[]> {
  const q = masterKnex(TABLE)
    .select(STUDENT_COLUMNS)
    .where({ session_id: sessionId })
    // What the customer deleted on their side (message.deleted) leaves the AI's history and the
    // summaries too; only the Inbox transcript (findBySessions) still shows "Message deleted".
    .whereNull("sender_deleted_at")
    .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
  if (opts.limit) q.limit(opts.limit);
  const rows = await q;
  return rows.reverse();
}

/** The newest `limit` messages across several sessions (a visitor's chats), oldest first. */
export async function findBySessions(sessionIds: number[], limit: number, opts: { inbox?: boolean } = {}): Promise<MessageRow[]> {
  if (!sessionIds.length) return [];
  const rows = await masterKnex(TABLE)
    .select(opts.inbox ? INBOX_COLUMNS : STUDENT_COLUMNS)
    .whereIn("session_id", sessionIds)
    .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
    .limit(limit);
  return rows.reverse();
}

export async function updateFeedback(id: number, feedback: "positive" | "negative" | null): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ feedback });
}

/** Delivery update from a Zernio webhook, matched on the platform message id. */
export async function setDelivery(providerMessageId: string, status: DeliveryStatus, error?: string | null): Promise<number> {
  // Never step backwards: a late "delivered" must not overwrite "read".
  const order = ["queued", "sent", "delivered", "read"];
  const q = masterKnex(TABLE).where({ provider_message_id: providerMessageId });
  if (status !== "failed") q.where((b) => b.whereNull("delivery_status").orWhereIn("delivery_status", order.slice(0, order.indexOf(status))).orWhere("delivery_status", "failed"));
  return q.update({ delivery_status: status, delivery_error: status === "failed" ? error ?? null : null });
}

/** A message we sent is confirmed by Zernio after the fact (or failed before it got an id). */
export async function setDeliveryById(id: number, patch: { provider_message_id?: string | null; delivery_status: DeliveryStatus; delivery_error?: string | null }): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({
    ...(patch.provider_message_id ? { provider_message_id: patch.provider_message_id } : {}),
    delivery_status: patch.delivery_status,
    delivery_error: patch.delivery_error ?? null,
  });
}

export async function markSenderDeleted(providerMessageId: string): Promise<number> {
  return masterKnex(TABLE).where({ provider_message_id: providerMessageId }).update({ sender_deleted_at: masterKnex.fn.now() });
}

export async function editByProvider(providerMessageId: string, content: string): Promise<number> {
  return masterKnex(TABLE).where({ provider_message_id: providerMessageId }).update({ content });
}

export async function existsByProvider(providerMessageId: string): Promise<boolean> {
  return !!(await masterKnex(TABLE).where({ provider_message_id: providerMessageId }).first("id"));
}
