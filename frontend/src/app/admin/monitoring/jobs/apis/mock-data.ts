import type { JobPosting } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockJobs: JobPosting[] = [
  { id: 1, title: "International Student Advisor", company: "Global Study Institute", location: "Melbourne, AU", status: "Active" },
  { id: 2, title: "Migration Case Officer", company: "Everest Migration Consultants", location: "Remote", status: "Pending" },
];

export const jobsMockApi = {
  getJobs: async (): Promise<JobPosting[]> => {
    console.log("[mock] GET /admin/jobs");
    await delay(300);
    return mockJobs;
  },
};
