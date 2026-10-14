import { httpGet, httpPost } from "@/lib/api/http";
import type { LedgerEntry, DailyLogEntry, LedgerPage, UserSearchResult, AdjustInput, DailyLogPage, ChartResponse, ChartMetric } from "./types";

/** The backend's paginated envelope keeps counts under `meta`; the slice reads them flat. */
type Paged<T> = { data: T[]; meta: { total: number; page: number; limit: number } };
const flatten = <T,>({ data, meta }: Paged<T>) => ({ data, total: meta.total, page: meta.page, limit: meta.limit });

export const creditsLedgerRealApi = {
  getLedger: async (params: { page?: number; limit?: number; reason?: string; search?: string }): Promise<LedgerPage> => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.reason) q.set("reason", params.reason);
    if (params.search) q.set("search", params.search);
    return flatten(await httpGet<Paged<LedgerEntry>>(`/admin/revenue/credits/ledger?${q}`));
  },

  searchUsers: (q: string, role: "platform" | "admin"): Promise<UserSearchResult[]> =>
    httpGet(`/admin/revenue/credits/users/search?q=${encodeURIComponent(q.trim())}&role=${role}`),

  adjust: (input: AdjustInput): Promise<{ ok: boolean }> =>
    httpPost("/admin/revenue/credits/adjust", input),

  getDailyLog: async (params: { date?: string; page?: number; limit?: number; search?: string }): Promise<DailyLogPage> => {
    const q = new URLSearchParams();
    if (params.date) q.set("date", params.date);
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    const { date, ...page } = await httpGet<Paged<DailyLogEntry> & { date: string }>(`/admin/revenue/credits/daily?${q}`);
    return { ...flatten(page), date };
  },

  getChart: (params: { metric?: ChartMetric; days?: number }): Promise<ChartResponse> => {
    const q = new URLSearchParams();
    if (params.metric) q.set("metric", params.metric);
    if (params.days) q.set("days", String(params.days));
    return httpGet(`/admin/revenue/credits/chart?${q}`);
  },
};
