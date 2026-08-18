import { httpGet, httpPost } from "@/lib/api/http";
import type {
  CreateEnquiryInput,
  CreateEnquiryResult,
  Enquiry,
  EnquiryListItem,
  PaginatedResponse,
} from "./types";

export const enquiriesRealApi = {
  createEnquiry: (input: CreateEnquiryInput): Promise<CreateEnquiryResult> => httpPost("/enquiries", input),
  // The route param is the raw id from the URL; the server coerces it, and a
  // non-numeric one is a 400 rather than a lookup.
  getEnquiry: (id: string): Promise<Enquiry> => httpGet(`/enquiries/${id}`),
  listEnquiries: (): Promise<PaginatedResponse<EnquiryListItem>> => httpGet("/enquiries?limit=100"),
};
