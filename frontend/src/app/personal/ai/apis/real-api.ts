import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import { getAccessToken } from "@/lib/session";
import type {
  ChatSession,
  CourseCard,
  CreditBalance,
  FeedbackInput,
  GuestMigrationResult,
  Message,
  MessagesResponse,
  SendMessageInput,
  SessionListResponse,
  SSEEvent,
} from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3`;

/**
 * The counsellor's own card shape, as it comes off the wire.
 * `real-api.ts` is the only place that knows it; the store and the components see
 * CourseCard and nothing else.
 */
type WireCard = {
  id?: string;
  name?: string;
  institution?: string;
  degree_level?: string;
  duration?: string;
  fees?: number | null;
  currency?: string;
  country?: string;
  city?: string;
  intakes?: string[];
  study_modes?: string[];
  source_url?: string | null;
};

function toCourseCard(card: WireCard): CourseCard {
  return {
    institution_name: card.institution ?? "",
    course_name: card.name ?? "",
    degree_level: card.degree_level ?? "",
    duration: card.duration ?? "",
    annual_tuition_fee: card.fees ?? null,
    currency: card.currency ?? "",
    country: card.country ?? "",
    intakes: card.intakes ?? [],
    study_modes: card.study_modes ?? [],
    source_url: card.source_url ?? null,
  };
}

/**
 * Translate one SSE frame into the store's event vocabulary.
 *
 * The backend emits named frames (`session`, `trace`, `cards`, `chips`, `usage`)
 * plus data-only frames in the OpenAI delta shape, and closes with `[DONE]`. The
 * store speaks a flatter language, so the mapping lives here rather than being
 * spread through reducers.
 *
 * `usage` carries the assistant message's real id, which is what `done` needs in
 * order for feedback to address the right row.
 */
function translateFrame(frame: string, state: { messageId: number }): SSEEvent | null {
  const lines = frame.split("\n");
  const eventLine = lines.find((l) => l.startsWith("event:"));
  const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  if (!dataLines.length) return null;

  const raw = dataLines.join("\n");
  if (raw === "[DONE]") return { type: "done", message_id: state.messageId };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // malformed frame — drop it rather than break the stream
  }

  // Data-only frame: a token of the answer.
  if (!eventLine) {
    const text = (data as { choices?: Array<{ delta?: { content?: string } }> })?.choices?.[0]?.delta
      ?.content;
    return text ? { type: "delta", text } : null;
  }

  const payload = data as Record<string, unknown>;
  switch (eventLine.slice(6).trim()) {
    case "session": {
      // Only a brand-new session belongs at the top of the sidebar.
      if (!payload.isNew) return null;
      const now = new Date().toISOString();
      const session: ChatSession = {
        id: Number(payload.id),
        title: "New chat",
        is_archived: false,
        created_at: now,
        updated_at: now,
      };
      return { type: "session_created", session };
    }
    case "trace":
      return { type: "trace", step: String(payload.step ?? "") };
    case "cards":
      return { type: "cards", cards: (data as WireCard[]).map(toCourseCard) };
    case "chips":
      return { type: "chips", chips: (data as string[]).filter((c) => typeof c === "string") };
    case "usage":
      state.messageId = Number(payload.message_id ?? 0);
      return { type: "usage", credits_charged: Number(payload.credits_charged ?? 0) };
    default:
      // `sources` and anything the backend adds later: not consumed by this view yet.
      return null;
  }
}

export const aiRealApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    const res = await httpGet<SessionListResponse>("/ai-chat/sessions");
    return res.sessions;
  },

  getMessages: async (sessionId: number): Promise<Message[]> => {
    const res = await httpGet<MessagesResponse>(`/ai-chat/sessions/${sessionId}/messages`);
    return res.messages;
  },

  updateSession: async (sessionId: number, data: { title?: string; is_archived?: boolean }): Promise<ChatSession> =>
    httpPatch<ChatSession>(`/ai-chat/sessions/${sessionId}`, data),

  setFeedback: async (messageId: number, feedback: "up" | "down" | null): Promise<void> => {
    await httpPatch<unknown>(`/ai-chat/messages/${messageId}/feedback`, { feedback } satisfies FeedbackInput);
  },

  getCreditBalance: async (): Promise<CreditBalance> =>
    httpGet<CreditBalance>("/ai-chat/credits/balance"),

  /**
   * Adopt the transcript from a chat had before signing up. Safe to call more than
   * once: the server moves it at most once and reports `migrated: false` after that.
   */
  migrateGuestChat: async (fingerprintHash: string): Promise<GuestMigrationResult> =>
    httpPost<GuestMigrationResult>("/ai-chat/guest/migrate", { fingerprint_hash: fingerprintHash }),

  /**
   * SSE streaming for sendMessage. Uses raw fetch + ReadableStream because httpPost
   * expects JSON, but this endpoint returns text/event-stream.
   */
  sendMessage: async (
    input: SendMessageInput,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const token = getAccessToken();

    const res = await fetch(`${BASE_URL}/ai-chat/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok) {
      // 402 (out of credits) and 503 (no model configured) both land here with a
      // JSON body — surface the server's own message rather than a generic failure.
      const text = await res.text().catch(() => "");
      let message = text || `Request failed (${res.status})`;
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        // not JSON — keep the raw text
      }
      throw new Error(message);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    const state = { messageId: 0 };
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      // Keep the last (potentially incomplete) frame in the buffer
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const event = translateFrame(frame, state);
        if (event) onEvent(event);
      }
    }

    const tail = translateFrame(buffer, state);
    if (tail) onEvent(tail);
  },
};
