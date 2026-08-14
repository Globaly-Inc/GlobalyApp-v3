import { httpDelete, httpGet, httpPost } from "@/lib/api/http";
import type { AiExtractionJob } from "./types";

const FILTERED_ENDPOINT =
  "/admin/data-extraction/jobs-filtered?statuses=pending,mapping,scraping,extracting,verifying,review,failed,paused,stalled&exclude_source_type=agentcis";

export const aiExtractionRealApi = {
  getInProgressJobs: async (): Promise<AiExtractionJob[]> => {
    const { jobs } = await httpGet<{ jobs: AiExtractionJob[] }>(FILTERED_ENDPOINT);
    return jobs;
  },

  pauseJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/pause`, {}),
  resumeJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/resume`, {}),
  deleteJob: (id: string): Promise<void> => httpDelete(`/admin/data-extraction/jobs/${id}`),
  declineJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/decline`, {}),
};
