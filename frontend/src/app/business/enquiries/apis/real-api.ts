import { httpGet, httpPost } from "@/lib/api/http";
import type { CloseResult, CreditBalance, DistributionListItem, EnquiryMessage, UnlockResult } from "./types";

export const businessEnquiriesRealApi = {
  listDistributions: (): Promise<{ data: DistributionListItem[] }> => httpGet("/enquiry-distributions?limit=100"),

  getCredits: (): Promise<CreditBalance> => httpGet("/enquiry-distributions/credits"),

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached — both
  // surface as thrown Errors carrying the server's message.
  unlock: (id: string): Promise<UnlockResult> => httpPost(`/enquiry-distributions/${id}/unlock`, {}),

  close: (id: string, closeReason: string): Promise<CloseResult> =>
    httpPost(`/enquiry-distributions/${id}/close`, { close_reason: closeReason }),

  // 409 until the row is unlocked, and once it is closed — the server decides.
  getMessages: (id: string): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-distributions/${id}/messages`),
  sendMessage: (id: string, body: string): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-distributions/${id}/messages`, { body }),
};
