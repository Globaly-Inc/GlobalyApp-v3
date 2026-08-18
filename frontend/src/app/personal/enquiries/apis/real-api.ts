import { httpGet, httpPost } from "@/lib/api/http";
import type { CreateEnquiryInput, Enquiry, EnquiryListItem, PaginatedResponse } from "./types";

export const enquiriesRealApi = {
  createEnquiry: (input: CreateEnquiryInput): Promise<Enquiry> => httpPost("/enquiries", input),
  getEnquiry: (id: string): Promise<Enquiry> => httpGet(`/enquiries/${id}`),
  listEnquiries: (): Promise<PaginatedResponse<EnquiryListItem>> => httpGet("/enquiries?limit=100"),
};
