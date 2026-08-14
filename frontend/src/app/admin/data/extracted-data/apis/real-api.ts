import { httpGet, httpPost } from "@/lib/api/http";
import type { ExtractedJob } from "./types";

export const extractedDataRealApi = {
  getExtractedJobs: async (): Promise<ExtractedJob[]> => {
    const { jobs } = await httpGet<{ jobs: ExtractedJob[] }>(
      "/admin/data-extraction/jobs-filtered?statuses=done,completed,approved,verified,exported,pushed,declined,review",
    );
    return jobs;
  },

  promoteJob: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/${id}/promote`, {});
  },
};
