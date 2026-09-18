import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPut } from "@/lib/api/http";
import type {
  Accreditation, Category, Lookup, LookupKind, Paginated, RegistrationType, SearchListParams,
} from "@/app/admin/platform/categories/apis/types";
import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, InvitationListResult, LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  PartnerInstitutionCourse, PartnerInstitutionCourseListParams, PartnerInstitutionCourseListResult, PartnerInstitutionDetail, Permission,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, Role, RoleCreateInput, RolePatch,
  SchemaFieldValue, Scholarship, ScholarshipInput,
  ScholarshipListParams, ScholarshipListResult, ScholarshipPatch, ServiceAccreditationLink, ServiceEligibility,
  ServiceEligibilityInput, ServiceEligibilityPatch, ServiceFee, ServiceFeeInput, ServiceFeePatch, ServiceInput,
  ServiceIntake, ServiceIntakeInput, ServiceIntakePatch, ServicePatch, ServiceSearchParams, ServiceSearchResult,
  ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch, ServiceStudyUnit, ServiceStudyUnitInput,
  ServiceStudyUnitPatch,
} from "./types";

/** Generic list/create/update/delete client for one service child resource — same shape for
 * fees/intakes/eligibility/study-options/study-units, just a different path segment. `orgBase`
 * routes an institution session to /institutions/services/... instead of /businesses/services/...
 * (same table, different owning entity — see business-profile-detail-slice.ts's getOrgBase). */
function childResourceApi<TRow, TInput, TPatch>(path: string) {
  return {
    list: (serviceId: string, orgBase = BASE): Promise<TRow[]> => httpGet(`${orgBase}/services/${serviceId}/${path}`),
    create: (serviceId: string, input: TInput, orgBase = BASE): Promise<TRow> =>
      httpPost(`${orgBase}/services/${serviceId}/${path}`, input),
    update: (serviceId: string, id: number, patch: TPatch, orgBase = BASE): Promise<TRow> =>
      httpPatch(`${orgBase}/services/${serviceId}/${path}/${id}`, patch),
    remove: (serviceId: string, id: number, orgBase = BASE): Promise<void> =>
      httpDelete(`${orgBase}/services/${serviceId}/${path}/${id}`),
  };
}

const BASE = "/businesses";

function toBranchQuery(params: BranchListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.filter_branch) q.set("filter_branch", params.filter_branch);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toRelationQuery(params: RelationListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toCourseQuery(params: PartnerInstitutionCourseListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toServiceSearchQuery(params: ServiceSearchParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toMemberQuery(params: MemberListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toActivityQuery(params: ActivityListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toBusinessSearchQuery(params: BusinessSearchParams): string {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.limit) q.set("limit", String(params.limit));
  // Only sent when on: the branch picker must keep getting businesses only, since it stores a
  // bare id with no kind alongside it.
  if (params.include_institutions) q.set("include_institutions", "true");
  // Representations picker: server enforces the verified consultancy<->institution pairing
  // regardless of this flag — see businesses.service.ts searchBusinesses.
  if (params.for_partner_link) q.set("for_partner_link", "true");
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toScholarshipQuery(params: ScholarshipListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toSearchListQuery(params: SearchListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const businessProfileDetailRealApi = {
  searchBusinesses: (params: BusinessSearchParams = {}): Promise<BusinessSearchResult[]> =>
    httpGet(`${BASE}/search${toBusinessSearchQuery(params)}`),

  getBranches: async (params: BranchListParams = {}, orgBase = BASE): Promise<BranchListResult> => {
    const { data, meta } = await httpGet<{ data: Branch[]; meta: { total: number } }>(`${orgBase}/branches${toBranchQuery(params)}`);
    return { data, total: meta.total };
  },
  createBranch: (input: BranchInput, orgBase = BASE): Promise<Branch> => httpPost(`${orgBase}/branches`, input),
  updateBranch: (branchId: string, patch: BranchPatch, orgBase = BASE): Promise<Branch> => httpPatch(`${orgBase}/branches/${branchId}`, patch),
  // No institution twin — linking another registered org as a branch is business-to-business only.
  linkExistingBranch: (input: LinkExistingBranchInput): Promise<LinkExistingBranchResult> =>
    httpPost(`${BASE}/branches/link-existing`, input),
  deleteBranch: (branchId: string, orgBase = BASE): Promise<void> => httpDelete(`${orgBase}/branches/${branchId}`),

  searchServices: async (params: ServiceSearchParams = {}, orgBase = BASE): Promise<ServiceSearchResult> => {
    const { data, meta } = await httpGet<{ data: BusinessService[]; meta: { total: number } }>(`${orgBase}/services/search${toServiceSearchQuery(params)}`);
    return { data, total: meta.total };
  },
  createService: (input: ServiceInput, orgBase = BASE): Promise<BusinessService> => httpPost(`${orgBase}/services`, input),
  updateService: (serviceId: string, patch: ServicePatch, orgBase = BASE): Promise<BusinessService> =>
    httpPatch(`${orgBase}/services/${serviceId}`, patch),
  deleteService: (serviceId: string, orgBase = BASE): Promise<void> => httpDelete(`${orgBase}/services/${serviceId}`),
  uploadServiceCover: (serviceId: string, file: File, orgBase = BASE): Promise<BusinessService> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${orgBase}/services/${serviceId}/cover`, form);
  },
  // 204, like every other delete here — the caller clears `cover_url` in its own state.
  removeServiceCover: (serviceId: string, orgBase = BASE): Promise<void> =>
    httpDelete(`${orgBase}/services/${serviceId}/cover`),

  getServiceFieldValues: (serviceId: string, orgBase = BASE): Promise<SchemaFieldValue[]> =>
    httpGet(`${orgBase}/services/${serviceId}/field-values`),
  updateServiceFieldValues: (serviceId: string, values: SchemaFieldValue[], orgBase = BASE): Promise<SchemaFieldValue[]> =>
    httpPut(`${orgBase}/services/${serviceId}/field-values`, { values }),

  getMembers: async (params: MemberListParams = {}): Promise<MemberListResult> => {
    const { data, meta } = await httpGet<{ data: Member[]; meta: { total: number } }>(`${BASE}/members${toMemberQuery(params)}`);
    return { data, total: meta.total };
  },
  getMemberRoles: (): Promise<MemberRole[]> => httpGet(`${BASE}/members/roles`),
  inviteMember: (input: MemberInviteInput): Promise<{ id: string; email: string; status: string }> =>
    httpPost(`${BASE}/members/invite`, input),
  updateMember: (memberId: number, patch: MemberPatch): Promise<Member> => httpPatch(`${BASE}/members/${memberId}`, patch),
  removeMember: (memberId: number): Promise<void> => httpDelete(`${BASE}/members/${memberId}`),

  getInvitations: async (params: MemberListParams = {}): Promise<InvitationListResult> => {
    const { data, meta } = await httpGet<{ data: InvitationListResult["data"]; meta: { total: number } }>(`${BASE}/members/invitations${toMemberQuery(params)}`);
    return { data, total: meta.total };
  },
  cancelInvitation: (invitationId: string): Promise<void> => httpDelete(`${BASE}/members/invitations/${invitationId}`),
  resendInvitation: (invitationId: string): Promise<void> => httpPost(`${BASE}/members/invitations/${invitationId}/resend`, {}),

  getRoles: (orgBase = BASE): Promise<Role[]> => httpGet(`${orgBase}/roles`),
  getPermissions: (orgBase = BASE): Promise<Permission[]> => httpGet(`${orgBase}/roles/permissions`),
  createRole: (input: RoleCreateInput, orgBase = BASE): Promise<Role> => httpPost(`${orgBase}/roles`, input),
  updateRole: (roleId: number, patch: RolePatch, orgBase = BASE): Promise<Role> => httpPatch(`${orgBase}/roles/${roleId}`, patch),
  deleteRole: (roleId: number, orgBase = BASE): Promise<void> => httpDelete(`${orgBase}/roles/${roleId}`),

  getRelations: async (params: RelationListParams = {}, orgBase = BASE): Promise<RelationListResult> => {
    const { data, meta } = await httpGet<{ data: BusinessRelation[]; meta: { total: number } }>(`${orgBase}/partners${toRelationQuery(params)}`);
    return { data, total: meta.total };
  },
  createRelation: (input: RelationInput, orgBase = BASE): Promise<BusinessRelation> => httpPost(`${orgBase}/partners`, input),
  updateRelation: (relationId: string, patch: RelationPatch, orgBase = BASE): Promise<BusinessRelation> =>
    httpPatch(`${orgBase}/partners/${relationId}`, patch),
  deleteRelation: (relationId: string, orgBase = BASE): Promise<void> => httpDelete(`${orgBase}/partners/${relationId}`),

  getPartnerInstitutionDetail: (institutionId: number): Promise<PartnerInstitutionDetail> =>
    httpGet(`${BASE}/partners/institutions/${institutionId}`),
  getPartnerInstitutionCourses: async (
    institutionId: number,
    params: PartnerInstitutionCourseListParams = {},
  ): Promise<PartnerInstitutionCourseListResult> => {
    const { data, meta } = await httpGet<{ data: PartnerInstitutionCourse[]; meta: { total: number } }>(
      `${BASE}/partners/institutions/${institutionId}/courses${toCourseQuery(params)}`,
    );
    return { data, total: meta.total };
  },

  getActivity: async (params: ActivityListParams = {}): Promise<ActivityListResult> => {
    const { data, meta } = await httpGet<{ data: ActivityLogEntry[]; meta: { total: number } }>(`${BASE}/activity${toActivityQuery(params)}`);
    return { data, total: meta.total };
  },

  getScholarships: async (params: ScholarshipListParams = {}): Promise<ScholarshipListResult> => {
    const { data, meta } = await httpGet<{ data: Scholarship[]; meta: { total: number } }>(`${BASE}/scholarships${toScholarshipQuery(params)}`);
    return { data, total: meta.total };
  },
  createScholarship: (input: ScholarshipInput): Promise<Scholarship> => httpPost(`${BASE}/scholarships`, input),
  updateScholarship: (scholarshipId: number, patch: ScholarshipPatch): Promise<Scholarship> =>
    httpPatch(`${BASE}/scholarships/${scholarshipId}`, patch),
  deleteScholarship: (scholarshipId: number): Promise<void> => httpDelete(`${BASE}/scholarships/${scholarshipId}`),

  serviceFees: childResourceApi<ServiceFee, ServiceFeeInput, ServiceFeePatch>("fees"),
  serviceIntakes: childResourceApi<ServiceIntake, ServiceIntakeInput, ServiceIntakePatch>("intakes"),
  serviceEligibility: childResourceApi<ServiceEligibility, ServiceEligibilityInput, ServiceEligibilityPatch>("eligibility"),
  serviceStudyOptions: childResourceApi<ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch>("study-options"),
  serviceStudyUnits: childResourceApi<ServiceStudyUnit, ServiceStudyUnitInput, ServiceStudyUnitPatch>("study-units"),

  getServiceAccreditations: (serviceId: string, orgBase = BASE): Promise<ServiceAccreditationLink[]> =>
    httpGet(`${orgBase}/services/${serviceId}/accreditations`),
  linkServiceAccreditation: (serviceId: string, accreditation_id: number, orgBase = BASE): Promise<ServiceAccreditationLink> =>
    httpPost(`${orgBase}/services/${serviceId}/accreditations`, { accreditation_id }),
  unlinkServiceAccreditation: (serviceId: string, id: number, orgBase = BASE): Promise<void> =>
    httpDelete(`${orgBase}/services/${serviceId}/accreditations/${id}`),

  getServiceCategories: (params: SearchListParams = {}, orgBase = BASE): Promise<Paginated<Category>> =>
    httpGet(`${orgBase}/service-categories${toSearchListQuery({ limit: 10, ...params })}`),
  getLookups: (kind: LookupKind, params: SearchListParams = {}, orgBase = BASE): Promise<Paginated<Lookup>> =>
    httpGet(`${orgBase}/${kind}${toSearchListQuery(params)}`),
  getAccreditations: (params: SearchListParams = {}, orgBase = BASE): Promise<Paginated<Accreditation>> =>
    httpGet(`${orgBase}/accreditations${toSearchListQuery(params)}`),
  // Same orgBase treatment as its siblings: lookups.routes.ts is registered under both
  // /businesses and /institutions, so an institution session must not be sent to /businesses.
  /** Unpaginated: the server returns one country's handful, already falling back to the generic set. */
  getRegistrationTypes: (countryId?: number | null, orgBase = BASE): Promise<{ data: RegistrationType[] }> =>
    httpGet(`${orgBase}/registration-types${countryId ? `?country_id=${countryId}` : ""}`),
};
