import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  CreateEmbedConfigInput, EmbedConfig, EmbedConfigListResponse,
  VisitorCounts, VisitorListParams, VisitorListResult, VisitorPatch, WidgetVisitor,
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
};
