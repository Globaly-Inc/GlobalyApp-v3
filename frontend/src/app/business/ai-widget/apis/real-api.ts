import { httpDelete, httpGet, httpPost } from "@/lib/api/http";
import type { CreateEmbedConfigInput, EmbedConfig, EmbedConfigListResponse } from "./types";

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
};
