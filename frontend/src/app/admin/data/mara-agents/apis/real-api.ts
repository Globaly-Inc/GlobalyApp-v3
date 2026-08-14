import { httpGet, httpPost } from "@/lib/api/http";
import type { MaraExtraction, MaraExtractionStatus } from "./types";

export const maraAgentsRealApi = {
  listMaraAgents: async (status?: MaraExtractionStatus): Promise<MaraExtraction[]> => {
    const qs = status && status !== ("all" as string) ? `?status=${status}&limit=100` : "?limit=100";
    const { mara_agents } = await httpGet<{ mara_agents: MaraExtraction[] }>(`/admin/data-extraction/mara-agents${qs}`);
    return mara_agents;
  },

  discardMaraAgent: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/mara-agents/${id}/discard`, {});
  },

  promoteMaraAgent: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/mara-agents/${id}/promote`, {});
  },

  // ponytail: backend returns 503 for now, caller handles with toast
  launchExtraction: async (urls: string[]): Promise<void> => {
    await httpPost(`/admin/data-extraction/mara-agents/extract`, { urls });
  },
};
