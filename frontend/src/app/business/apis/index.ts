import { createApi } from "@/lib/api/create-api";
import { businessMockApi } from "./mock-data";
import { businessRealApi } from "./real-api";

export const businessApi = createApi({ mock: businessMockApi, real: businessRealApi });
export type {
  BusinessType, BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, RegisterBusinessResult, SelectOption,
  SocialLinks,
} from "./types";
