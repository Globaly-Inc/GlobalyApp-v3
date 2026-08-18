// Offline fixture, selected only when NEXT_PUBLIC_MOCK_DATA=true. Same method
// names and same shapes as real-api.ts, so the view cannot tell them apart.

import type {
  AdminEnquiry,
  AdminEnquiryStats,
  ListEnquiriesParams,
  Paginated,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEnquiries: AdminEnquiry[] = [
  {
    id: 1,
    status: "converted",
    message: "I would like to study nursing in Sydney. Which intakes are still open?",
    preferred_intake: "October",
    preferred_year: 2027,
    target_org_type: "institution",
    target_org_id: 12,
    distributed_at: "2026-08-14T09:15:00.000Z",
    converted_at: "2026-08-16T04:02:00.000Z",
    created_at: "2026-08-14T09:14:00.000Z",
    student_id: 41,
    student_name: "Aarav Sharma",
    student_email: "aarav.sharma@example.com",
    distributed_to: 5,
    unlocked_count: 3,
    credits_earned: 90,
  },
  {
    id: 2,
    status: "pending",
    message: "Looking for a business masters with a scholarship. Budget is tight.",
    preferred_intake: "February",
    preferred_year: 2027,
    target_org_type: null,
    target_org_id: null,
    distributed_at: "2026-08-16T11:40:00.000Z",
    converted_at: null,
    created_at: "2026-08-16T11:39:00.000Z",
    student_id: 58,
    student_name: "Mei Lin",
    student_email: "mei.lin@example.com",
    distributed_to: 4,
    unlocked_count: 0,
    credits_earned: 0,
  },
];

const mockStats: AdminEnquiryStats = {
  enquiries: { total: 2, pending: 1, converted: 1, last_7_days: 2 },
  distributions_total: 9,
  unlocks: { total: 3, credits_spent: 90 },
  digest_queue: { pending: 4, failed: 0 },
};

export const enquiriesMockApi = {
  getEnquiries: async (params: ListEnquiriesParams = {}): Promise<Paginated<AdminEnquiry>> => {
    console.log("[mock] GET /admin/monitoring/enquiries", params);
    await delay(300);
    const filtered = params.status
      ? mockEnquiries.filter((e) => e.status === params.status)
      : mockEnquiries;
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

  getStats: async (): Promise<AdminEnquiryStats> => {
    console.log("[mock] GET /admin/monitoring/enquiries/stats");
    await delay(300);
    return mockStats;
  },
};
