import { createApi } from "@/lib/api/create-api";
import { businessEnquiriesMockApi } from "./mock-data";
import { businessEnquiriesRealApi } from "./real-api";

export const businessEnquiriesApi = createApi({ mock: businessEnquiriesMockApi, real: businessEnquiriesRealApi });
export type {
  CloseResult,
  CreditBalance,
  DistributionListItem,
  EligibilityCriterion,
  EnquiryMessage,
  UnlockedStudentProfile,
  UnlockResult,
} from "./types";
