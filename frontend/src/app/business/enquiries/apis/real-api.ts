import { httpGet, httpPost } from "@/lib/api/http";
import type { CloseResult, CreditBalance, InboxItem, PaginatedResponse, UnlockResult } from "./types";

// One canonical path per resource: /business/enquiries is where the D1 module
// serves this inbox. These calls used to point at /enquiry-distributions, the
// prefix of a second enquiries backend that did not survive the staging merge —
// aliasing the surviving module onto both prefixes would have left one resource
// with two URLs, which is the debt that collision started with.
const BASE = "/business/enquiries";

export const businessEnquiriesRealApi = {
  listDistributions: (): Promise<PaginatedResponse<InboxItem>> => httpGet(`${BASE}?limit=100`),

  getCredits: (): Promise<CreditBalance> => httpGet(`${BASE}/credits`),

  // 402 when credits are short — surfaces as a thrown ApiError carrying the
  // server's own message. There is no unlock cap to 409 on: the cap in this
  // module is on how many businesses the lead reaches, applied at distribution.
  unlock: (id: number): Promise<UnlockResult> => httpPost(`${BASE}/${id}/unlock`, {}),

  close: (id: number, closeReason: string): Promise<CloseResult> =>
    httpPost(`${BASE}/${id}/close`, { close_reason: closeReason }),
};
