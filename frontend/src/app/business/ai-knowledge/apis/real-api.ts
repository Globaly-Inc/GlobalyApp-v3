import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  CreateMemoryInput, CreateMemoryOutcome, Memory, MemoryListParams, PatchMemoryInput,
  ConversionInsights, PatchRackProfileInput, ReviewInput, ReviewMessage, ReviewSession, StoredRackProfile,
} from "./types";

const BASE = "/ai-chat/institution";

function toMemoryQuery(params: MemoryListParams): string {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.type) q.set("type", params.type);
  if (params.source) q.set("source", params.source);
  // Explicit "false" matters: the backend's booleanQueryParam reads the string, and omitting
  // the key is "no filter" rather than "not flagged".
  if (params.flagged !== undefined) q.set("flagged", String(params.flagged));
  if (params.conflicting !== undefined) q.set("conflicting", String(params.conflicting));
  if (params.q) q.set("q", params.q);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const aiKnowledgeRealApi = {
  getProfile: (): Promise<StoredRackProfile> => httpGet(`${BASE}/ai-profile`),

  getConversionInsights: (): Promise<ConversionInsights> => httpGet(`${BASE}/conversion-insights`),

  updateProfile: (patch: PatchRackProfileInput): Promise<StoredRackProfile> =>
    httpPatch(`${BASE}/ai-profile`, patch),

  listMemories: async (params: MemoryListParams = {}): Promise<Memory[]> => {
    const res = await httpGet<{ memories: Memory[] }>(`${BASE}/memories${toMemoryQuery(params)}`);
    return res.memories;
  },

  getMemory: (id: string): Promise<Memory> => httpGet(`${BASE}/memories/${id}`),

  createMemory: (input: CreateMemoryInput): Promise<CreateMemoryOutcome> =>
    httpPost(`${BASE}/memories`, input),

  updateMemory: (id: string, input: PatchMemoryInput): Promise<Memory> =>
    httpPatch(`${BASE}/memories/${id}`, input),

  approveMemory: (id: string): Promise<Memory> => httpPost(`${BASE}/memories/${id}/approve`, {}),

  deprecateMemory: (id: string, reason: string): Promise<Memory> =>
    httpPost(`${BASE}/memories/${id}/deprecate`, { reason }),

  reactivateMemory: (id: string): Promise<Memory> => httpPost(`${BASE}/memories/${id}/reactivate`, {}),

  /** "I looked, it stays" — clears the vote flag without changing status. */
  unflagMemory: (id: string): Promise<Memory> => httpPost(`${BASE}/memories/${id}/unflag`, {}),

  deleteMemory: async (id: string): Promise<void> => {
    await httpDelete(`${BASE}/memories/${id}`);
  },

  listConversations: async (params: { unreviewed?: boolean; limit?: number } = {}): Promise<ReviewSession[]> => {
    const q = new URLSearchParams();
    if (params.unreviewed) q.set("unreviewed", "true");
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    const res = await httpGet<{ sessions: ReviewSession[] }>(`${BASE}/conversations${qs ? `?${qs}` : ""}`);
    return res.sessions;
  },

  listConversationMessages: async (sessionId: number): Promise<ReviewMessage[]> => {
    const res = await httpGet<{ session_id: number; messages: ReviewMessage[] }>(
      `${BASE}/conversations/${sessionId}/messages`,
    );
    return res.messages;
  },

  /**
   * Not under /institution/ — the review action lives beside the student feedback route in
   * chat.routes, and it is what publishes the learning job.
   */
  reviewMessage: async (messageId: number, review: ReviewInput): Promise<void> => {
    await httpPost(`/ai-chat/messages/${messageId}/review`, review);
  },
};
