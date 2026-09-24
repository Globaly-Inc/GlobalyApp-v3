import { httpGet, httpPost } from "@/lib/api/http";
import { INBOX_PAGE_SIZE } from "../const";
import type {
  CloseResult,
  CreditBalance,
  DistributionListParams,
  DistributionListResult,
  UnlockResult,
  UnlockedStudentProfile,
} from "./types";

export const businessEnquiriesRealApi = {
  listDistributions: (params: DistributionListParams = {}): Promise<DistributionListResult> => {
    const q = new URLSearchParams();
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? INBOX_PAGE_SIZE));
    // Omitted when blank: the backend rejects an empty `search` rather than reading it as
    // "no filter", so clearing the box must drop the param.
    if (params.search?.trim()) q.set("search", params.search.trim());
    if (params.status) q.set("status", params.status);
    return httpGet(`/enquiry-distributions?${q.toString()}`);
  },

  getCredits: (): Promise<CreditBalance> => httpGet("/enquiry-distributions/credits"),

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached — both
  // surface as thrown Errors carrying the server's message.
  unlock: (id: string): Promise<UnlockResult> => httpPost(`/enquiry-distributions/${id}/unlock`, {}),

  // 402 while the distribution is still locked — the paywall is enforced server-side, so this is
  // safe to call optimistically rather than gating it on local state.
  getStudentProfile: (id: string): Promise<UnlockedStudentProfile> =>
    httpGet(`/enquiry-distributions/${id}/student-profile`),

  close: (id: string, closeReason: string): Promise<CloseResult> =>
    httpPost(`/enquiry-distributions/${id}/close`, { close_reason: closeReason }),

  // Chat moved out: the thread lives in the /business/messages feature, which owns the
  // whole /enquiry-distributions/messages surface. The inbox only deep-links into it.
};
