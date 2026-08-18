import { httpGet } from "@/lib/api/http";
import type { ListCreditsParams, PaginatedCredits } from "./types";

function toQuery(params: ListCreditsParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.kind) search.set("kind", params.kind);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const creditLedgerRealApi = {
  listCredits: (params: ListCreditsParams = {}): Promise<PaginatedCredits> =>
    httpGet(`/admin/revenue/credits${toQuery(params)}`),
};
