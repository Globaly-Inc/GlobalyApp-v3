import { httpGet } from "@/lib/api/http";
import type { RecentEnquiries, RecentEnquiry } from "./types";

export const homeRealApi = {
  // The rail needs the five most recent plus the true total, and meta.total is the only place the total is.
  listRecentEnquiries: async (): Promise<RecentEnquiries> => {
    const page = await httpGet<{ data?: RecentEnquiry[]; meta?: { total?: number } }>("/enquiries?page=1&limit=5");
    return { items: Array.isArray(page?.data) ? page.data : [], total: Number(page?.meta?.total ?? 0) };
  },
};
