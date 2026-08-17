import { masterKnex } from "../../../core/db/master-pool.js";

export interface MessageRow {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  sources: unknown[];
  cards: unknown[];
  chips: unknown[];
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
      attachments: JSON.stringify(data.attachments ?? []),
      prompt_tokens: data.prompt_tokens ?? null,
      completion_tokens: data.completion_tokens ?? null,
      total_tokens: data.total_tokens ?? null,
      latency_ms: data.latency_ms ?? null,
    })
    .returning("*");
  return row;
}

export async function findBySession(
  sessionId: number,
  opts: { limit?: number; beforeId?: number } = {},
): Promise<MessageRow[]> {
  const q = masterKnex(TABLE)
    .where({ session_id: sessionId })
    .orderBy("created_at", "asc");
  if (opts.beforeId) q.andWhere("id", "<", opts.beforeId);
  if (opts.limit) q.limit(opts.limit);
  return q;
}

export async function updateFeedback(id: number, feedback: "positive" | "negative"): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ feedback });
}
