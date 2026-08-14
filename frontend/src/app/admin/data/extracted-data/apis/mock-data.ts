import type { ExtractedJob } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockJobs: ExtractedJob[] = [
  { id: "1", institution_name: "Concordia University of Edmonton", institution_url: "https://concordia.ab.ca/", status: "done", courses_extracted: 33, verification_score: 30, verification_total: 33, created_at: "2026-06-30T09:00:00Z", updated_at: "2026-06-30T09:00:00Z" },
  { id: "2", institution_name: "Sheridan College", institution_url: "https://sheridancollege.ca", status: "review", courses_extracted: 96, verification_score: 90, verification_total: 96, created_at: "2026-06-24T09:00:00Z", updated_at: "2026-06-24T09:00:00Z" },
  { id: "3", institution_name: "Aboard Training Australia", institution_url: "https://ataustralia.edu.au/", status: "approved", courses_extracted: 10, verification_score: 10, verification_total: 10, created_at: "2026-06-30T07:00:00Z", updated_at: "2026-06-30T07:00:00Z" },
  { id: "4", institution_name: "Torrens University", institution_url: "https://www.torrens.edu.au", status: "declined", courses_extracted: 0, verification_score: 0, verification_total: 0, created_at: "2026-06-20T09:00:00Z", updated_at: "2026-06-20T09:00:00Z" },
  { id: "5", institution_name: "RMIT University", institution_url: "https://www.rmit.edu.au", status: "exported", courses_extracted: 180, verification_score: 175, verification_total: 180, created_at: "2026-06-18T09:00:00Z", updated_at: "2026-06-18T09:00:00Z" },
];

export const extractedDataMockApi = {
  getExtractedJobs: async (): Promise<ExtractedJob[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered?statuses=done,completed,...");
    await delay(300);
    return mockJobs;
  },

  promoteJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/" + id + "/promote");
    await delay(300);
  },
};
