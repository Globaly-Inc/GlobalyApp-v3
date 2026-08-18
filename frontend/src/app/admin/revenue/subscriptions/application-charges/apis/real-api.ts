import { httpGet, httpPost } from "@/lib/api/http";
import type {
  ApplicationCharge,
  ChargeStats,
  ListChargesParams,
  Paginated,
  VoidResult,
} from "./types";

const BASE = "/admin/revenue/application-charges";

function toQuery(params: Record<string, unknown>): string {
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

export const applicationChargesRealApi = {
  getCharges: async (params: ListChargesParams = { limit: 100 }): Promise<ApplicationCharge[]> =>
    paginate<ApplicationCharge>(
      await httpGet<Partial<Paginated<ApplicationCharge>>>(`${BASE}${toQuery(params)}`),
    ).data,

  getStats: async (): Promise<ChargeStats> => {
    const raw = await httpGet<Partial<ChargeStats>>(`${BASE}/stats`);
    return {
      total: Number(raw?.total ?? 0),
      charged: Number(raw?.charged ?? 0),
      waived: Number(raw?.waived ?? 0),
      refunded: Number(raw?.refunded ?? 0),
      credits_charged: Number(raw?.credits_charged ?? 0),
    };
  },

  // Both verbs return the credits, exactly once, and are safe to replay: the
  // backend compare-and-sets the status before granting.
  waive: (id: number): Promise<VoidResult> => httpPost<VoidResult>(`${BASE}/${id}/waive`, {}),
  refund: (id: number): Promise<VoidResult> => httpPost<VoidResult>(`${BASE}/${id}/refund`, {}),
};
