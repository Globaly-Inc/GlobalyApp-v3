// Offline fixture, selected only when NEXT_PUBLIC_MOCK_DATA=true. Same method
// names and same shapes as real-api.ts, so the view cannot tell them apart.

import type {
  AdminTrainingProgram,
  AdminTrainingStats,
  ListTrainingProgramsParams,
  Paginated,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockPrograms: AdminTrainingProgram[] = [
  {
    id: 1,
    business_id: 12,
    business_name: "Southern Cross University",
    title: "Agent compliance essentials",
    category: "Compliance",
    target_audience: "agents",
    is_published: true,
    is_mandatory: true,
    passing_score: 80,
    created_at: "2026-05-11T09:00:00.000Z",
    chapters: 7,
    enrolments: 142,
    certificates_issued: 96,
  },
  {
    id: 2,
    business_id: 31,
    business_name: "Kangan Institute",
    title: "Ambassador onboarding",
    category: "Onboarding",
    target_audience: "ambassadors",
    is_published: false,
    is_mandatory: false,
    passing_score: 70,
    created_at: "2026-07-02T09:00:00.000Z",
    chapters: 4,
    enrolments: 12,
    certificates_issued: 3,
  },
];

const mockStats: AdminTrainingStats = {
  programs: { total: 2, published: 1 },
  enrolments: { total: 154, last_30_days: 23 },
  certificates: { total: 99, expired: 7, gold: 21 },
  gamification: { learners: 88, total_xp: 4_120, longest_streak: 34 },
};

export const trainingMockApi = {
  getPrograms: async (
    params: ListTrainingProgramsParams = {},
  ): Promise<Paginated<AdminTrainingProgram>> => {
    await delay(200);
    const filtered = params.target_audience
      ? mockPrograms.filter((p) => p.target_audience === params.target_audience)
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

  getStats: async (): Promise<AdminTrainingStats> => {
    await delay(200);
    return mockStats;
  },
};
