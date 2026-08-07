import { httpGet } from "@/lib/api/http";
import type { JobPosting } from "./types";

export const jobsRealApi = {
  getJobs: (): Promise<JobPosting[]> => httpGet("/admin/jobs"),
};
