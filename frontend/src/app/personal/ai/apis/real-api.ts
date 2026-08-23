import { authHeaders, httpGet, httpPatch, withRefreshRetry } from "@/lib/api/http";
import type {
  AttachmentUpload,
  ChatSession,
  CourseCard,
  CreditBalance,
  Message,
  ResponseBlock,
  SendMessageInput,
  SSEEvent,
  WireCourseCard,
} from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3/ai-chat`;

/** Backend streams/stores cards in prompt format; the renderer wants CourseCard.
 * Mirror of the mapper in embed/[key]/apis/real-api.ts, which must stay import-free of this file. */
function toCourseCard(w: WireCourseCard): CourseCard {
  return {
    id: w.id,
    slug: w.slug ?? null,
    course_name: w.name ?? "",
    institution_name: w.institution ?? "",
    institution_logo_url: w.institution_logo_url ?? null,
    degree_level: w.degree_level ?? "",
    duration: w.duration ?? "",
    annual_tuition_fee: w.fees ?? null,
    currency: w.currency ?? "",
    country: w.country ?? "",
    city: w.city ?? null,
    intakes: w.intakes ?? [],
    study_modes: w.study_modes ?? [],
    source_url: w.source_url ?? null,
  };
}

/** DB title is null until auto-title lands (or if it failed) — the UI always shows a label. */
type WireSession = Omit<ChatSession, "title"> & { title: string | null };
const toSession = (s: WireSession): ChatSession => ({ ...s, title: s.title ?? "New chat" });

/** DB stores feedback as positive/negative; the UI speaks up/down. */
const toUiFeedback = { positive: "up", negative: "down" } as const;
const toWireFeedback = { up: "positive", down: "negative" } as const;

type WireMessage = Omit<Message, "cards" | "feedback" | "blocks"> & {
  cards: WireCourseCard[];
  blocks?: ResponseBlock[];
  feedback: "positive" | "negative" | null;
};

function toMessage(m: WireMessage): Message {
  return {
    ...m,
    cards: (m.cards ?? []).map(toCourseCard),
    // Backend validates block shapes before persisting; rows predating blocks return []
    blocks: m.blocks ?? [],
    feedback: m.feedback ? toUiFeedback[m.feedback] : null,
  };
}

export const aiRealApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    // Archived included — the sidebar's Archived tab filters client-side.
    const res = await httpGet<{ sessions: WireSession[] }>("/ai-chat/sessions?include_archived=true");
    return res.sessions.map(toSession);
  },

  getMessages: async (sessionId: number): Promise<Message[]> => {
    const res = await httpGet<{ messages: WireMessage[] }>(`/ai-chat/sessions/${sessionId}/messages`);
    return res.messages.map(toMessage);
  },

  updateSession: async (sessionId: number, data: { title?: string; is_archived?: boolean }): Promise<ChatSession> =>
    toSession(await httpPatch<WireSession>(`/ai-chat/sessions/${sessionId}`, data)),

  deleteSession: async (sessionId: number): Promise<void> => {
    // Soft delete rides the same PATCH endpoint (backend sets deleted_at).
    await httpPatch<ChatSession>(`/ai-chat/sessions/${sessionId}`, { delete: true });
  },

  setFeedback: async (messageId: number, feedback: "up" | "down" | null): Promise<void> => {
    await httpPatch<unknown>(`/ai-chat/messages/${messageId}/feedback`, {
      feedback: feedback ? toWireFeedback[feedback] : null,
    });
  },

  getCreditBalance: async (): Promise<CreditBalance> =>
    httpGet<CreditBalance>("/ai-chat/credits/balance"),

  uploadAttachment: async (file: File): Promise<AttachmentUpload> => {
    const form = new FormData();
    form.append("file", file);
    // withRefreshRetry: raw fetch bypasses httpPost, so token expiry/refresh must be handled here too
    const res = await withRefreshRetry(() => fetch(`${BASE_URL}/attachments`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    }));
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body as { error?: string } | null)?.error ?? "Upload failed");
    }
    return res.json();
  },

  /**
   * SSE stream for POST /messages. Raw fetch + ReadableStream because httpPost
   * expects JSON. Named events carry `event:` + `data:` pairs; deltas arrive as
   * data-only OpenAI-format chunks; a named `done` event carries the message id
   * and `data: [DONE]` ends the stream. Same protocol as embed/[key]/apis/real-api.ts.
   */
  sendMessage: async (
    input: SendMessageInput,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    // withRefreshRetry: SSE uses raw fetch (httpPost expects JSON), so an expired
    // access token must be refreshed here too — otherwise chats older than the
    // 15-min token lifetime end every send with the backend's "Invalid token" 401.
    const res = await withRefreshRetry(() => fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        // Backend schema wants the key absent for a new chat, not null
        ...(input.session_id ? { session_id: input.session_id } : {}),
        content: input.content,
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      }),
      signal,
    }));

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body as { error?: string } | null)?.error ?? "Failed to send message.");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let eventType = "";

    const emit = (data: string) => {
      if (data === "[DONE]") return; // named `done` event already delivered the ids
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // skip malformed events
      }
      if (!eventType) {
        // Data-only line = OpenAI-format delta chunk
        const text = (parsed as { choices?: [{ delta?: { content?: string } }] }).choices?.[0]?.delta?.content;
        if (text) onEvent({ type: "delta", text });
      } else if (eventType === "session") {
        const { id, isNew, title } = parsed as { id: number; isNew: boolean; title?: string };
        if (isNew) {
          // Stub entry named after the prompt; auto-title upgrades it after the exchange
          const now = new Date().toISOString();
          onEvent({
            type: "session_created",
            session: { id, title: title ?? "New chat", is_archived: false, created_at: now, updated_at: now },
          });
        }
      } else if (eventType === "trace") {
        onEvent({ type: "trace", step: (parsed as { step: string }).step });
      } else if (eventType === "cards") {
        onEvent({ type: "cards", cards: (parsed as WireCourseCard[]).map(toCourseCard) });
      } else if (eventType === "chips") {
        onEvent({ type: "chips", chips: parsed as string[] });
      } else if (eventType === "blocks") {
        onEvent({ type: "blocks", blocks: parsed as ResponseBlock[] });
      } else if (eventType === "done") {
        onEvent({ type: "done", message_id: (parsed as { message_id: number }).message_id });
      } else if (eventType === "error") {
        onEvent({ type: "error", error: (parsed as { error: string }).error });
      }
      // sources / usage — nothing to render yet
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) emit(line.slice(5).trim());
        else if (line === "") eventType = "";
      }
    }
  },
};
