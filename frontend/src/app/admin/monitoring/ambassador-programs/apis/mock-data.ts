// Offline fixture, selected only when NEXT_PUBLIC_MOCK_DATA=true. Same method
// names and same shapes as real-api.ts, so the view cannot tell them apart.

import type {
  AdminAmbassadorProgram,
  AdminAmbassadorStats,
  ListAmbassadorProgramsParams,
  Paginated,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockPrograms: AdminAmbassadorProgram[] = [
  {
    id: 1,
    business_id: 12,
    business_name: "Southern Cross University",
    name: "Student ambassadors",
    slug: "scu-student-ambassadors",
    status: "active",
    created_at: "2026-06-02T09:00:00.000Z",
    active_ambassadors: 18,
    pending_applications: 4,
    total_inquiries: 231,
    resolved_inquiries: 194,
  },
  {
    id: 2,
    business_id: 31,
    business_name: "Kangan Institute",
    name: "Peer connect",
    slug: "kangan-peer-connect",
    status: "paused",
    created_at: "2026-04-18T09:00:00.000Z",
    active_ambassadors: 3,
    pending_applications: 0,
    total_inquiries: 27,
    resolved_inquiries: 12,
  },
];

const mockStats: AdminAmbassadorStats = {
  programs: { total: 2, active: 1 },
  ambassadors: { total: 24, active: 21 },
  inquiries: { total: 258, resolved: 206, last_7_days: 19, escalated: 6 },
  payouts: { total: 41, paid_minor: 384_500, failed: 1 },
};

export const ambassadorProgramsMockApi = {
  getPrograms: async (
    params: ListAmbassadorProgramsParams = {},
  ): Promise<Paginated<AdminAmbassadorProgram>> => {
    await delay(200);
    const filtered = params.status
      ? mockPrograms.filter((p) => p.status === params.status)
      : mockPrograms;
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    return {
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
    };
  },

  getStats: async (): Promise<AdminAmbassadorStats> => {
    await delay(200);
    return mockStats;
  },
};
