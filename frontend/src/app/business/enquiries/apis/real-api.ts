import { httpGet, httpPost } from "@/lib/api/http";
import type { CloseResult, CreditBalance, DistributionListItem, UnlockResult } from "./types";

export const businessEnquiriesRealApi = {
  listDistributions: (): Promise<{ data: DistributionListItem[] }> => httpGet("/enquiry-distributions?limit=100"),

  getCredits: (): Promise<CreditBalance> => httpGet("/enquiry-distributions/credits"),

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached — both
  // surface as thrown Errors carrying the server's message.
  unlock: (id: string): Promise<UnlockResult> => httpPost(`/enquiry-distributions/${id}/unlock`, {}),

  close: (id: string, closeReason: string): Promise<CloseResult> =>
    httpPost(`/enquiry-distributions/${id}/close`, { close_reason: closeReason }),
};
