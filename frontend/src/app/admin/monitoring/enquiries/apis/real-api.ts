import { httpGet } from "@/lib/api/http";
import type {
  AdminEnquiry,
  AdminEnquiryStats,
  ListEnquiriesParams,
  Paginated,
} from "./types";

const BASE = "/admin/monitoring/enquiries";

function toQuery(params: ListEnquiriesParams): string {
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

export const enquiriesRealApi = {
  getEnquiries: async (params: ListEnquiriesParams = {}): Promise<Paginated<AdminEnquiry>> =>
    paginate<AdminEnquiry>(
      await httpGet<Partial<Paginated<AdminEnquiry>>>(`${BASE}${toQuery(params)}`),
    ),

  getStats: async (): Promise<AdminEnquiryStats> => {
    const raw = await httpGet<Partial<AdminEnquiryStats>>(`${BASE}/stats`);
    return {
      enquiries: {
        total: Number(raw?.enquiries?.total ?? 0),
        pending: Number(raw?.enquiries?.pending ?? 0),
        converted: Number(raw?.enquiries?.converted ?? 0),
        last_7_days: Number(raw?.enquiries?.last_7_days ?? 0),
      },
      distributions_total: Number(raw?.distributions_total ?? 0),
      unlocks: {
        total: Number(raw?.unlocks?.total ?? 0),
        credits_spent: Number(raw?.unlocks?.credits_spent ?? 0),
      },
      digest_queue: {
        pending: Number(raw?.digest_queue?.pending ?? 0),
        failed: Number(raw?.digest_queue?.failed ?? 0),
      },
    };
  },
};
