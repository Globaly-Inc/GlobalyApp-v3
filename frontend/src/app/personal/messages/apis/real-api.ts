import { httpGet, httpPost } from "@/lib/api/http";
import { getAccessToken } from "@/lib/session";
import type {
  Conversation,
  ConversationDetail,
  ConversationSummary,
  Message,
  Paginated,
  ReadReceipt,
} from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3`;

export const messagesRealApi = {
  listConversations: (page = 1, limit = 30): Promise<Paginated<ConversationSummary>> =>
    httpGet<Paginated<ConversationSummary>>(`/messaging/conversations?page=${page}&limit=${limit}`),

  /** One conversation with a page of history. Pass the anchor back for older pages. */
  getConversation: (id: number, opts: { page?: number; limit?: number; anchorId?: number } = {}) => {
    const params = new URLSearchParams({
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 30),
    });
    if (opts.anchorId) params.set("anchor_id", String(opts.anchorId));
    return httpGet<ConversationDetail>(`/messaging/conversations/${id}?${params}`);
  },

  startConversation: (input: { student_user_id: number; enquiry_id?: number; title?: string }) =>
    httpPost<{ conversation_id: number; existing: boolean }>("/messaging/conversations", input),

  sendMessage: async (id: number, content: string): Promise<Message> => {
    const res = await httpPost<{ message: Message }>(`/messaging/conversations/${id}/messages`, { content });
    return res.message;
  },

  inviteParticipant: (id: number, inviteeUserId: number) =>
    httpPost<{ participant: unknown }>(`/messaging/conversations/${id}/participants`, {
      invitee_user_id: inviteeUserId,
    }),

  markRead: (id: number): Promise<ReadReceipt> =>
    httpPost<ReadReceipt>(`/messaging/conversations/${id}/read`, {}),

  /**
   * Live thread. Raw fetch + a stream reader rather than EventSource: EventSource cannot
   * send the Authorization header the API requires. Same parser shape as the AI chat's
   * real-api, because both endpoints emit the same `event:`/`data:` frames.
   */
  streamConversation: async (
    id: number,
    sinceId: number,
    onMessage: (message: Message) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const token = getAccessToken();
    const res = await fetch(`${BASE_URL}/messaging/conversations/${id}/stream?since_id=${sinceId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
    if (!res.ok || !res.body) throw new Error("Live updates are unavailable");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? ""; // keep the partial frame for the next chunk

      for (const frame of frames) {
        const lines = frame.split("\n");
        const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
        const data = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (event !== "message" || !data) continue; // heartbeats are comment frames
        try {
          onMessage(JSON.parse(data) as Message);
        } catch {
          // a truncated frame is not worth tearing the stream down for
        }
      }
    }
  },
};

export type { Conversation };
