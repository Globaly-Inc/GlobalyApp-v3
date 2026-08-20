import { httpGet, httpPost } from "@/lib/api/http";
import type { EnquiryMessage, MessageThreadSummary } from "./types";

export const messagesRealApi = {
  listThreads: (): Promise<{ threads: MessageThreadSummary[] }> => httpGet("/enquiry-messages"),

  getMessages: (distributionId: string): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-messages/${distributionId}`),

  sendMessage: (distributionId: string, body: string): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-messages/${distributionId}`, { body }),
};
