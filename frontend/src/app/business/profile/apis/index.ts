import { createApi } from "@/lib/api/create-api";
import { businessProfileDetailMockApi } from "./mock-data";
import { businessProfileDetailRealApi } from "./real-api";

export const businessProfileDetailApi = createApi({ mock: businessProfileDetailMockApi, real: businessProfileDetailRealApi });
export type {
  ActivityLogEntry, Branch, BranchFilter, BranchInput, BranchPatch, BranchType,
  BusinessRelation, BusinessSearchResult, BusinessService, InvitedMember, Member, MemberRole, RelationType,
  SchemaFieldValue, Scholarship, ScholarshipInput, ScholarshipPatch, ServiceInput, ServiceSearchParams, SharedServices,
} from "./types";
