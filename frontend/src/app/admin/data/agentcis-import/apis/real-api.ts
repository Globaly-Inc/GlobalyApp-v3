import { httpPost } from "@/lib/api/http";
import type { AgentCISResult, ImportResult } from "./types";

export const agentcisImportRealApi = {
  search: async (query: string): Promise<AgentCISResult[]> => {
    const { results } = await httpPost<{ results: AgentCISResult[] }>(
      "/admin/data-extraction/agentcis/search",
      { query },
    );
    return results;
  },

  importInstitutions: async (ids: number[]): Promise<ImportResult> => {
    return httpPost<ImportResult>("/admin/data-extraction/agentcis/import", {
      institution_ids: ids,
    });
  },
};
