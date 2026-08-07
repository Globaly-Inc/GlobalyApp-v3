import { httpGet } from "@/lib/api/http";
import type { ExtractedInstitution } from "./types";

export const extractedDataRealApi = {
  getExtracted: async (): Promise<ExtractedInstitution[]> => {
    const { jobs } = await httpGet<{ jobs: ExtractedInstitution[] }>(
      "/admin/data-extraction/jobs-filtered?statuses=review,verified,approved,exported",
    );
    return jobs;
  },
};
