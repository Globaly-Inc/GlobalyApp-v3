import { createApi } from "@/lib/api/create-api";
import { businessProfileDetailMockApi } from "./mock-data";
import { businessProfileDetailRealApi } from "./real-api";

export const businessProfileDetailApi = createApi({ mock: businessProfileDetailMockApi, real: businessProfileDetailRealApi });
export type {
  ActivityLogEntry, Branch, BranchFilter, BranchInput, BranchPatch, BranchType,
  BusinessRelation, BusinessSearchResult, BusinessService, InvitedMember, Member, MemberRole,
  PartnerInstitutionCourse, PartnerInstitutionDetail, Permission,
  Role, RoleCreateInput, RolePatch,
  SchemaFieldValue, Scholarship, ScholarshipInput, ScholarshipPatch, ServiceAccreditationLink, ServiceEligibility,
  ServiceEligibilityInput, ServiceFee, ServiceFeeInput, ServiceInput, ServiceIntake, ServiceIntakeInput,
  ServiceSearchParams, ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyUnit, ServiceStudyUnitInput,
  SharedServices,
} from "./types";
