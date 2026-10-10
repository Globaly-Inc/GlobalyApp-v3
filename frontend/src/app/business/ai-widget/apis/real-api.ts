import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPostNoContent } from "@/lib/api/http";
import type { MessageAttachment } from "@/components/chat/types";
import type {
  ConversationControlResult, CreateEmbedConfigInput, EmbedConfig, EmbedConfigListResponse, EnsureEmbedResult, HandoffMode,
  SendSnippetInput, SendSnippetResult, SendVisitorMessageResult,
  UpdateEmbedConfigInput,
  VisitorCounts, VisitorListParams, VisitorListResult, VisitorChat, VisitorMessage, VisitorNote, VisitorPatch, WidgetVisitor,
} from "./types";

function toVisitorQuery(params: VisitorListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  // "all" is the backend default — sending it would just make the URL longer.
  if (params.status && params.status !== "all") q.set("status", params.status);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const aiWidgetRealApi = {
  listConfigs: async (): Promise<EmbedConfig[]> => {
    const res = await httpGet<EmbedConfigListResponse>("/ai-chat/embed/configs");
    return res.configs;
  },

  createConfig: (input: CreateEmbedConfigInput): Promise<EmbedConfig> =>
    httpPost<EmbedConfig>("/ai-chat/embed/configs", input),

  /** POST, not GET: the first call for an org mints its widget. Idempotent after that. */
  ensureConfig: (): Promise<EnsureEmbedResult> =>
    httpPost<EnsureEmbedResult>("/ai-chat/embed/ensure", {}),

  sendSnippet: (input: SendSnippetInput): Promise<SendSnippetResult> =>
    httpPost<SendSnippetResult>("/ai-chat/embed/send-snippet", input),

  forgetDeveloper: (id: number): Promise<void> =>
    httpDelete(`/ai-chat/embed/developers/${id}`),

  updateConfig: (id: number, input: UpdateEmbedConfigInput): Promise<EmbedConfig> =>
    httpPatch<EmbedConfig>(`/ai-chat/embed/configs/${id}`, input),

  rotateKey: (id: number): Promise<EmbedConfig> =>
    httpPost<EmbedConfig>(`/ai-chat/embed/configs/${id}/rotate-key`, {}),

  deactivateConfig: async (id: number): Promise<void> => {
    await httpDelete(`/ai-chat/embed/configs/${id}`);
  },

  reactivateConfig: async (id: number): Promise<void> => {
    await httpPatch(`/ai-chat/embed/configs/${id}/activate`, {});
  },

  listVisitors: async (params: VisitorListParams = {}): Promise<VisitorListResult> => {
    const res = await httpGet<{ data: WidgetVisitor[]; meta: { total: number }; counts: VisitorCounts }>(
      `/ai-chat/embed/visitors${toVisitorQuery(params)}`,
    );
    return { data: res.data, total: res.meta.total, counts: res.counts };
  },

  getVisitor: (id: number): Promise<WidgetVisitor> => httpGet(`/ai-chat/embed/visitors/${id}`),

  updateVisitor: (id: number, patch: VisitorPatch): Promise<WidgetVisitor> =>
    httpPatch(`/ai-chat/embed/visitors/${id}`, patch),

  listVisitorMessages: async (id: number): Promise<VisitorMessage[]> => {
    const res = await httpGet<{ messages: VisitorMessage[] }>(`/ai-chat/embed/visitors/${id}/messages`);
    return res.messages;
  },

  // ── Human takeover ─────────────────────────────────────────────────────────
  // The contract from the takeover plan; these endpoints don't exist yet, so the Inbox runs on
  // the mock until the backend lands. The server sets `role: "agent"` and the sender from the
  // token — nothing here says who is sending.

  /** Sends a staff reply. Takes the chat over from the AI if it was handling it. */
  sendVisitorMessage: (id: number, body: string, attachments: string[]): Promise<SendVisitorMessageResult> =>
    httpPost(`/ai-chat/embed/visitors/${id}/messages`, { body, attachments }),

  /** "human" takes the chat over without a message; "ai" hands it back. */
  setVisitorHandoff: (id: number, mode: HandoffMode): Promise<ConversationControlResult> =>
    httpPatch(`/ai-chat/embed/visitors/${id}/handoff`, { mode }),

  resolveVisitorChat: (id: number, resolved: boolean): Promise<ConversationControlResult> =>
    httpPatch(`/ai-chat/embed/visitors/${id}/resolve`, { resolved }),

  /** 204 — the caller has already zeroed the count. */
  markVisitorChatRead: (id: number): Promise<void> => httpPostNoContent(`/ai-chat/embed/visitors/${id}/read`),

  /** Every chat this visitor had, oldest first, each with its own summary. */
  listVisitorChats: async (id: number): Promise<VisitorChat[]> =>
    (await httpGet<{ chats: VisitorChat[] }>(`/ai-chat/embed/visitors/${id}/chats`)).chats,

  listVisitorNotes: async (id: number): Promise<VisitorNote[]> =>
    (await httpGet<{ notes: VisitorNote[] }>(`/ai-chat/embed/visitors/${id}/notes`)).notes,

  addVisitorNote: async (id: number, body: string, attachments: string[] = []): Promise<VisitorNote> =>
    (await httpPost<{ note: VisitorNote }>(`/ai-chat/embed/visitors/${id}/notes`, { body, attachments })).note,

  uploadVisitorAttachment: (file: File): Promise<MessageAttachment> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm("/ai-chat/embed/visitors/messages/media", form);
  },
};
