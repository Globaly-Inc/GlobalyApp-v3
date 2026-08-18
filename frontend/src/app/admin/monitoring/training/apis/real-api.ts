import { httpGet } from "@/lib/api/http";
import type {
  AdminTrainingProgram,
  AdminTrainingStats,
  ListTrainingProgramsParams,
  Paginated,
} from "./types";

const BASE = "/admin/monitoring/training";

function toQuery(params: ListTrainingProgramsParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Normalized at the boundary, like every other feature — a partial payload must not throw during render. */
function paginate<T>(raw: Partial<Paginated<T>> | undefined | null): Paginated<T> {
  return {
    data: Array.isArray(raw?.data) ? (raw.data as T[]) : [],
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
  };
}

export const trainingRealApi = {
  getPrograms: async (
    params: ListTrainingProgramsParams = {},
  ): Promise<Paginated<AdminTrainingProgram>> =>
    paginate<AdminTrainingProgram>(
      await httpGet<Partial<Paginated<AdminTrainingProgram>>>(`${BASE}${toQuery(params)}`),
    ),

  getStats: async (): Promise<AdminTrainingStats> => {
    const raw = await httpGet<Partial<AdminTrainingStats>>(`${BASE}/stats`);
    return {
      programs: {
        total: Number(raw?.programs?.total ?? 0),
        published: Number(raw?.programs?.published ?? 0),
      },
      enrolments: {
        total: Number(raw?.enrolments?.total ?? 0),
        last_30_days: Number(raw?.enrolments?.last_30_days ?? 0),
      },
      certificates: {
        total: Number(raw?.certificates?.total ?? 0),
        expired: Number(raw?.certificates?.expired ?? 0),
        gold: Number(raw?.certificates?.gold ?? 0),
      },
      gamification: {
        learners: Number(raw?.gamification?.learners ?? 0),
        total_xp: Number(raw?.gamification?.total_xp ?? 0),
        longest_streak: Number(raw?.gamification?.longest_streak ?? 0),
      },
    };
  },
};
