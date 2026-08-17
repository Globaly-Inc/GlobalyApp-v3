import { httpGet, httpPatch } from "@/lib/api/http";
import { getAccessToken, isTokenExpired } from "@/lib/session";
import type {
  ChatSession,
  CreditBalance,
  FeedbackInput,
  Message,
  MessagesResponse,
  SendMessageInput,
  SessionListResponse,
  SSEEvent,
} from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3`;

export const aiRealApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    const res = await httpGet<SessionListResponse>("/ai/sessions");
    return res.sessions;
  },

  getMessages: async (sessionId: number): Promise<Message[]> => {
    const res = await httpGet<MessagesResponse>(`/ai/sessions/${sessionId}/messages`);
    return res.messages;
  },

  updateSession: async (sessionId: number, data: { title?: string; is_archived?: boolean }): Promise<ChatSession> =>
    httpPatch<ChatSession>(`/ai/sessions/${sessionId}`, data),

  setFeedback: async (messageId: number, feedback: "up" | "down" | null): Promise<void> => {
    await httpPatch<unknown>(`/ai/messages/${messageId}/feedback`, { feedback } satisfies FeedbackInput);
  },

  getCreditBalance: async (): Promise<CreditBalance> =>
    httpGet<CreditBalance>("/ai/credits/balance"),

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
    if (token && isTokenExpired(token)) {
      // ponytail: skip refresh logic here — if token is expired the next httpGet will refresh.
      // For SSE, just let it fail and the user retries. Full refresh-retry for SSE adds complexity
      // we don't need in phase 1.
    }

    const res = await fetch(`${BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Request failed");
      throw new Error(text);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      let eventType = "";
      let dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        } else if (line === "" && eventType && dataLines.length > 0) {
          // Empty line = end of event
          try {
            const data = JSON.parse(dataLines.join("\n"));
            onEvent({ type: eventType, ...data } as SSEEvent);
          } catch {
            // skip malformed events
          }
          eventType = "";
          dataLines = [];
        }
      }
    }
  },
};
