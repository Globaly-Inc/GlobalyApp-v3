import { httpGet } from "@/lib/api/http";
import type { OverviewStats } from "./types";

export const overviewRealApi = {
  getStats: (): Promise<OverviewStats> => httpGet("/admin/overview/stats"),
};
