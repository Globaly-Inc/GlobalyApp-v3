import { httpGet, httpPost, httpDelete } from "@/lib/api/http";
import type { AgentCISResult, AgentcisJob, ImportResult } from "./types";

export const agentcisImportRealApi = {
  search: async (query: string): Promise<AgentCISResult[]> => {
    const { results } = await httpPost<{ results: AgentCISResult[] }>(
      "/admin/data-extraction/agentcis/search",
      { query },
    );
    return results;
  },

  importInstitutions: async (ids: string[]): Promise<ImportResult> => {
    return httpPost<ImportResult>("/admin/data-extraction/agentcis/import", {
      institution_ids: ids,
    });
  },

  getJobs: async (): Promise<AgentcisJob[]> => {
    const params = new URLSearchParams({
      source_type: "agentcis",
      statuses: "pending,processing,failed,done",
      limit: "100",
    });
    const { jobs } = await httpGet<{ jobs: AgentcisJob[] }>(
      `/admin/data-extraction/jobs-filtered?${params}`,
    );
    return jobs;
  },

  deleteJob: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/jobs/${id}`);
  },
};
