import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  ListScholarshipsParams,
  Paginated,
  Scholarship,
  ScholarshipStats,
} from "./types";

const BASE = "/admin/monitoring/scholarships";

function toQuery(params: ListScholarshipsParams): string {
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

export const scholarshipsRealApi = {
  getScholarships: async (params: ListScholarshipsParams = { limit: 100 }): Promise<Scholarship[]> =>
    paginate<Scholarship>(
      await httpGet<Partial<Paginated<Scholarship>>>(`${BASE}${toQuery(params)}`),
    ).data,

  getStats: async (): Promise<ScholarshipStats> => {
    const raw = await httpGet<Partial<ScholarshipStats>>(`${BASE}/stats`);
    return {
      total: Number(raw?.total ?? 0),
      published: Number(raw?.published ?? 0),
      pending: Number(raw?.pending ?? 0),
      approved: Number(raw?.approved ?? 0),
      rejected: Number(raw?.rejected ?? 0),
      featured: Number(raw?.featured ?? 0),
    };
  },

  approve: (id: number, publish: boolean): Promise<Scholarship> =>
    httpPost<Scholarship>(`${BASE}/${id}/approve`, { publish }),

  reject: (id: number, note?: string): Promise<Scholarship> =>
    httpPost<Scholarship>(`${BASE}/${id}/reject`, { note }),

  setPublished: (id: number, is_published: boolean): Promise<Scholarship> =>
    httpPatch<Scholarship>(`${BASE}/${id}/publish`, { is_published }),

  setFeatured: (id: number, is_featured: boolean): Promise<Scholarship> =>
    httpPatch<Scholarship>(`${BASE}/${id}/feature`, { is_featured }),
};
