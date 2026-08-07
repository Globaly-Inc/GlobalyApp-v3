import { httpGet } from "@/lib/api/http";
import type { MaraAgentSummary } from "./types";

export const maraAgentsRealApi = {
  getAgents: async (): Promise<MaraAgentSummary[]> => {
    const { mara_agents } = await httpGet<{ mara_agents: MaraAgentSummary[] }>("/admin/data-extraction/mara-agents");
    return mara_agents;
  },
};
