import { httpGet, httpPost } from "@/lib/api/http";
import type {
  Course,
  CreateEnquiryInput,
  Enquiry,
  EnquiryListItem,
  PaginatedResponse,
} from "./types";

export const enquiriesRealApi = {
  createEnquiry: (input: CreateEnquiryInput): Promise<Enquiry> => httpPost("/enquiries", input),
  getEnquiry: (id: string): Promise<Enquiry> => httpGet(`/enquiries/${id}`),
  listEnquiries: (): Promise<PaginatedResponse<EnquiryListItem>> => httpGet("/enquiries?limit=100"),

  /** Options for the new-enquiry course picker. */
  listCourses: (page = 1, limit = 20): Promise<PaginatedResponse<Course>> =>
    httpGet(`/courses?page=${page}&limit=${limit}`),
};
