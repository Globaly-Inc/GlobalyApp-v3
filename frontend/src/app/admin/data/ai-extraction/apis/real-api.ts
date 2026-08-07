import { httpGet } from "@/lib/api/http";
import type { ExtractionProgress } from "./types";

export const aiExtractionRealApi = {
  getInProgressJobs: async (): Promise<ExtractionProgress[]> => {
    const { jobs } = await httpGet<{ jobs: ExtractionProgress[] }>(
      "/admin/data-extraction/jobs-filtered?statuses=pending,processing,extracting",
    );
    return jobs;
  },
};
