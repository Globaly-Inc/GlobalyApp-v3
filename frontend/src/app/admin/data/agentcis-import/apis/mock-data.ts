import type { AgentCISResult, AgentcisJob, ImportResult } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockResults: AgentCISResult[] = [
  { id: "101", name: "University of Melbourne", website: "https://unimelb.edu.au", country: "Australia", city: "Melbourne" },
  { id: "102", name: "Sheridan College", website: "https://sheridancollege.ca", country: "Canada", city: "Oakville" },
  { id: "103", name: "RMIT University", website: "https://rmit.edu.au", country: "Australia", city: "Melbourne" },
  { id: "104", name: "Concordia University", website: "https://concordia.ca", country: "Canada", city: "Montreal" },
  { id: "105", name: "Auckland Institute of Studies", website: "https://ais.ac.nz", country: "New Zealand", city: "Auckland" },
];

const now = new Date().toISOString();
let mockJobs: AgentcisJob[] = [
  { id: "mock-1", institution_name: "University of Melbourne", institution_url: "https://unimelb.edu.au", status: "done", source_type: "agentcis", courses_extracted: 42, pipeline_progress: { phase: "done" }, created_at: now, updated_at: now },
  { id: "mock-2", institution_name: "Sheridan College", institution_url: "https://sheridancollege.ca", status: "processing", source_type: "agentcis", courses_extracted: 0, pipeline_progress: { phase: "courses", current: 12, total: 30 }, created_at: now, updated_at: now },
];

export const agentcisImportMockApi = {
  search: async (query: string): Promise<AgentCISResult[]> => {
    console.log("[mock] POST /admin/data-extraction/agentcis/search", { query });
    await delay(400);
    if (!query.trim()) return mockResults;
    const q = query.toLowerCase();
    return mockResults.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.country ?? "").toLowerCase().includes(q),
    );
  },

  importInstitutions: async (ids: string[]): Promise<ImportResult> => {
    console.log("[mock] POST /admin/data-extraction/agentcis/import", { institution_ids: ids });
    await delay(600);
    for (const id of ids) {
      const src = mockResults.find((r) => String(r.id) === id);
      mockJobs.unshift({
        id: `mock-${Date.now()}-${id}`,
        institution_name: src?.name ?? `AgentCIS #${id}`,
        institution_url: src?.website ?? null,
        status: "pending",
        source_type: "agentcis",
        courses_extracted: 0,
        pipeline_progress: { phase: "queued" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return { dispatched: true, job_count: ids.length };
  },

  getJobs: async (): Promise<AgentcisJob[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered?source_type=agentcis");
    await delay(300);
    return mockJobs;
  },

  deleteJob: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/data-extraction/jobs/" + id);
    await delay(200);
    mockJobs = mockJobs.filter((j) => j.id !== id);
  },
};
