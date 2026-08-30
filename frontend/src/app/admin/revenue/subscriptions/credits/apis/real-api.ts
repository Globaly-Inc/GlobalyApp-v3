import { httpGet, httpPost } from "@/lib/api/http";
import type { LedgerPage, UserSearchResult, AdjustInput } from "./types";

export const creditsLedgerRealApi = {
  getLedger: (params: { page?: number; limit?: number; reason?: string; search?: string }): Promise<LedgerPage> => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.reason) q.set("reason", params.reason);
    if (params.search) q.set("search", params.search);
    return httpGet(`/admin/revenue/credits/ledger?${q}`);
  },

  searchUsers: (q: string, role: "platform" | "admin"): Promise<UserSearchResult[]> =>
    httpGet(`/admin/revenue/credits/users/search?q=${encodeURIComponent(q.trim())}&role=${role}`),

  adjust: (input: AdjustInput): Promise<{ ok: boolean }> =>
    httpPost("/admin/revenue/credits/adjust", input),
};
