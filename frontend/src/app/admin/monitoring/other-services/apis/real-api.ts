import { httpGet } from "@/lib/api/http";
import type {
  AdminServiceListing,
  AdminServiceOrder,
  AdminServicesStats,
  Paginated,
} from "./types";

const BASE = "/admin/platform/other-services";

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

export const adminOtherServicesRealApi = {
  getStats: async (): Promise<AdminServicesStats> => {
    const raw = await httpGet<Partial<AdminServicesStats>>(`${BASE}/stats`);
    return {
      listings: {
        total: Number(raw?.listings?.total ?? 0),
        active: Number(raw?.listings?.active ?? 0),
        paused: Number(raw?.listings?.paused ?? 0),
      },
      orders: toArray<AdminServicesStats["orders"][number]>(raw?.orders),
    };
  },

  getListings: async (params: { search?: string; status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return paginate<AdminServiceListing>(
      await httpGet<Partial<Paginated<AdminServiceListing>>>(`${BASE}${query ? `?${query}` : ""}`),
    );
  },

  getOrders: async (params: { status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return paginate<AdminServiceOrder>(
      await httpGet<Partial<Paginated<AdminServiceOrder>>>(`${BASE}/orders${query ? `?${query}` : ""}`),
    );
  },
};
