import type { AgentCISResult, ImportResult } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockResults: AgentCISResult[] = [
  { id: 101, name: "University of Melbourne", type: "University", country: "Australia", region: "Victoria" },
  { id: 102, name: "Sheridan College", type: "College", country: "Canada", region: "Ontario" },
  { id: 103, name: "RMIT University", type: "University", country: "Australia", region: "Victoria" },
  { id: 104, name: "Concordia University", type: "University", country: "Canada", region: "Quebec" },
  { id: 105, name: "Auckland Institute of Studies", type: "Institute", country: "New Zealand", region: "Auckland" },
];

export const agentcisImportMockApi = {
  search: async (query: string): Promise<AgentCISResult[]> => {
    console.log("[mock] POST /admin/data-extraction/agentcis/search", { query });
    await delay(400);
    if (!query.trim()) return mockResults;
    const q = query.toLowerCase();
    return mockResults.filter(
      (r) => r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q),
    );
  },

  importInstitutions: async (ids: number[]): Promise<ImportResult> => {
    console.log("[mock] POST /admin/data-extraction/agentcis/import", { institution_ids: ids });
    await delay(600);
    return { dispatched: true, job_count: ids.length };
  },
};
