import { createApi } from "@/lib/api/create-api";
import { adminEnquiriesMockApi } from "./mock-data";
import { adminEnquiriesRealApi } from "./real-api";

export const adminEnquiriesApi = createApi({ mock: adminEnquiriesMockApi, real: adminEnquiriesRealApi });
export type {
  AdminEnquiry,
  AdminEnquiryDetail,
  AdminEnquiryDistribution,
  AdminEnquiryStats,
  EnquiryListParams,
  Paginated,
} from "./types";
