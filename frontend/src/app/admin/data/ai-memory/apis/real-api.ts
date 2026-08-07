import { httpGet } from "@/lib/api/http";
import type { SiteProfileSummary } from "./types";

export const aiMemoryRealApi = {
  getSiteProfiles: async (): Promise<SiteProfileSummary[]> => {
    const { profiles } = await httpGet<{ profiles: SiteProfileSummary[] }>("/admin/data-extraction/site-profiles");
    return profiles;
  },
};
