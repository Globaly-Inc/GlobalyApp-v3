import { createApi } from "@/lib/api/create-api";
import { enquiriesMockApi } from "./mock-data";
import { enquiriesRealApi } from "./real-api";

export const enquiriesApi = createApi({ mock: enquiriesMockApi, real: enquiriesRealApi });
export type {
  Course,
  CreateEnquiryInput,
  Enquiry,
  EnquiryListItem,
  EnquiryStatus,
  UnlockedBusiness,
} from "./types";
