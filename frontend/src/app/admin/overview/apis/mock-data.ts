import type { OverviewStats } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockStats: OverviewStats = {
  businesses: 128,
  platform_users: 4213,
  active_extractions: 6,
  scholarships_listed: 37,
};

export const overviewMockApi = {
  getStats: async (): Promise<OverviewStats> => {
    console.log("[mock] GET /admin/overview/stats");
    await delay(300);
    return mockStats;
  },
};
