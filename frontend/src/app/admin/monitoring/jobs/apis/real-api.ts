import { httpGet } from "@/lib/api/http";
import type { AdminJob, AdminJobStats, ListJobsParams, Paginated } from "./types";

const BASE = "/admin/monitoring/jobs";

function toQuery(params: ListJobsParams): string {
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

export const adminJobsRealApi = {
  getJobs: async (params: ListJobsParams = {}): Promise<Paginated<AdminJob>> =>
    paginate<AdminJob>(await httpGet<Partial<Paginated<AdminJob>>>(`${BASE}${toQuery(params)}`)),

  getStats: async (): Promise<AdminJobStats> => {
    const raw = await httpGet<Partial<AdminJobStats>>(`${BASE}/stats`);
    return {
      jobs: {
        total: Number(raw?.jobs?.total ?? 0),
        draft: Number(raw?.jobs?.draft ?? 0),
        open: Number(raw?.jobs?.open ?? 0),
        closed: Number(raw?.jobs?.closed ?? 0),
        expired: Number(raw?.jobs?.expired ?? 0),
      },
      applications: {
        total: Number(raw?.applications?.total ?? 0),
        last_7_days: Number(raw?.applications?.last_7_days ?? 0),
      },
    };
  },
};
