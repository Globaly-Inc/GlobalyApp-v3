import type { ExtractionProgress } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockProgress: ExtractionProgress[] = [
  { id: 1, institution: "Auckland Institute of Studies", progress: "48 / 60 pages", status: "Extracting", started: "6 hours ago" },
  { id: 2, institution: "RMIT University", progress: "3 / 200 pages", status: "Pending", started: "just now" },
];

export const aiExtractionMockApi = {
  getInProgressJobs: async (): Promise<ExtractionProgress[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered?status=pending,processing,extracting");
    await delay(300);
    return mockProgress;
  },
};
