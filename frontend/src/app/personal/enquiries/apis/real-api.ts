import { httpGet, httpPost } from "@/lib/api/http";
import { ENQUIRIES_PAGE_SIZE } from "../const";
import type {
  Course,
  CreateEnquiryInput,
  EligibilityVerdict,
  Enquiry,
  EnquiryListItem,
  EnquiryListParams,
  PaginatedResponse,
} from "./types";

export const enquiriesRealApi = {
  createEnquiry: (input: CreateEnquiryInput): Promise<Enquiry> => httpPost("/enquiries", input),
  getEnquiry: (id: string): Promise<Enquiry> => httpGet(`/enquiries/${id}`),
  listEnquiries: (params: EnquiryListParams = {}): Promise<PaginatedResponse<EnquiryListItem>> => {
    const q = new URLSearchParams();
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? ENQUIRIES_PAGE_SIZE));
    // Only sent when non-empty: the backend rejects a blank `search` rather than treating it as
    // "no filter", so clearing the box must omit the param entirely.
    if (params.search?.trim()) q.set("search", params.search.trim());
    if (params.status) q.set("status", params.status);
    return httpGet(`/enquiries?${q.toString()}`);
  },

  /** The student's eligibility for one course. Also called by the public course page, which is
   * why it lives on the enquiries API rather than inside the dialog. */
  getEligibility: (courseId: string): Promise<EligibilityVerdict> =>
    httpGet(`/enquiries/eligibility/${courseId}`),

  /** Options for the new-enquiry course picker. */
  listCourses: (page = 1, limit = 20): Promise<PaginatedResponse<Course>> =>
    httpGet(`/courses?page=${page}&limit=${limit}`),
};
