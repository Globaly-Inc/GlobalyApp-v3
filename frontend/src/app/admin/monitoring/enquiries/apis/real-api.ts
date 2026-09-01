import { httpGet } from "@/lib/api/http";
import type {
  AdminEnquiry,
  AdminEnquiryDetail,
  AdminEnquiryStats,
  EnquiryListParams,
  Paginated,
} from "./types";

const BASE = "/admin/monitoring/enquiries";

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Normalized at the boundary, like every other feature — a partial payload must not throw during render. */
function paginate<T>(raw: Partial<Paginated<T>> | undefined | null): Paginated<T> {
  return {
    data: toArray<T>(raw?.data),
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
  };
}

function query(params: EnquiryListParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const adminEnquiriesRealApi = {
  getStats: async (): Promise<AdminEnquiryStats> => {
    const raw = await httpGet<Partial<AdminEnquiryStats>>(`${BASE}/stats`);
    return {
      statuses: toArray<AdminEnquiryStats["statuses"][number]>(raw?.statuses),
      total: Number(raw?.total ?? 0),
      distributions: {
        total: Number(raw?.distributions?.total ?? 0),
        unlocked: Number(raw?.distributions?.unlocked ?? 0),
        coins_spent: Number(raw?.distributions?.coins_spent ?? 0),
      },
    };
  },

  getEnquiries: async (params: EnquiryListParams = {}): Promise<Paginated<AdminEnquiry>> =>
    paginate<AdminEnquiry>(await httpGet<Partial<Paginated<AdminEnquiry>>>(`${BASE}${query(params)}`)),

  getEnquiry: async (id: string): Promise<AdminEnquiryDetail> => {
    const raw = await httpGet<AdminEnquiryDetail>(`${BASE}/${id}`);
    return { ...raw, distributions: toArray(raw?.distributions) };
  },
};
