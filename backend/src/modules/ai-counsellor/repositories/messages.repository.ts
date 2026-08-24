import { masterKnex } from "../../../core/db/master-pool.js";

export interface MessageRow {
  id: number;
  session_id: number;
  role: "user" | "assistant";
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
  created_at: Date;
}

const TABLE = "ai_counselor_messages";

export async function create(data: {
  session_id: number;
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
  cards?: unknown[];
  chips?: unknown[];
  blocks?: unknown[];
  attachments?: unknown[];
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
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
    .where({ session_id: sessionId })
    .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
  if (opts.limit) q.limit(opts.limit);
  const rows = await q;
  return rows.reverse();
}

export async function updateFeedback(id: number, feedback: "positive" | "negative" | null): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ feedback });
}
