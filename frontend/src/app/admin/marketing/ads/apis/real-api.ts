import { httpGet, httpPost } from "@/lib/api/http";
import type { AdCampaign, AdReport, AdStats, AdStatus, ListAdsParams, Paginated } from "./types";

const BASE = "/admin/marketing/ads";

const AD_STATUSES: AdStatus[] = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
  "completed",
];

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

export const adsRealApi = {
  getCampaigns: async (params: ListAdsParams = { limit: 100 }): Promise<AdCampaign[]> =>
    paginate<AdCampaign>(await httpGet<Partial<Paginated<AdCampaign>>>(`${BASE}${toQuery(params)}`)).data,

  getStats: async (): Promise<AdStats> => {
    const raw = await httpGet<Partial<AdStats>>(`${BASE}/stats`);
    // Every status defaulted to 0 so a tile never renders `undefined` while the
    // backend's vocabulary and the UI's drift apart by one release.
    const counts = Object.fromEntries(AD_STATUSES.map((s) => [s, Number(raw?.[s] ?? 0)])) as Record<
      AdStatus,
      number
    >;
    return { ...counts, total: Number(raw?.total ?? 0), pending_reports: Number(raw?.pending_reports ?? 0) };
  },

  getReports: async (limit = 100): Promise<AdReport[]> =>
    paginate<AdReport>(
      await httpGet<Partial<Paginated<AdReport>>>(`${BASE}/reports${toQuery({ status: "pending", limit })}`),
    ).data,

  approve: (id: number): Promise<AdCampaign> => httpPost<AdCampaign>(`${BASE}/${id}/approve`, {}),

  /** The reason is required — the backend 400s without it and so does the DB. */
  reject: (id: number, reason: string): Promise<AdCampaign> =>
    httpPost<AdCampaign>(`${BASE}/${id}/reject`, { reason }),

  pause: (id: number): Promise<AdCampaign> => httpPost<AdCampaign>(`${BASE}/${id}/pause`, {}),
};
