import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/lib/api/http";
import type {
  Accreditation, Category, Lookup, LookupKind, Paginated, SearchListParams,
} from "@/app/admin/platform/categories/apis/types";
import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, InvitationListResult, LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole, Permission,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, Role, RoleCreateInput, RolePatch,
  SchemaFieldValue, Scholarship, ScholarshipInput,
  ScholarshipListParams, ScholarshipListResult, ScholarshipPatch, ServiceAccreditationLink, ServiceEligibility,
  ServiceEligibilityInput, ServiceEligibilityPatch, ServiceFee, ServiceFeeInput, ServiceFeePatch, ServiceInput,
  ServiceIntake, ServiceIntakeInput, ServiceIntakePatch, ServicePatch, ServiceSearchParams, ServiceSearchResult,
  ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch, ServiceStudyUnit, ServiceStudyUnitInput,
  ServiceStudyUnitPatch,
} from "./types";

/** Generic list/create/update/delete client for one service child resource — same shape for
 * fees/intakes/eligibility/study-options/study-units, just a different path segment. */
function childResourceApi<TRow, TInput, TPatch>(path: string) {
  return {
    list: (serviceId: string): Promise<TRow[]> => httpGet(`${BASE}/services/${serviceId}/${path}`),
    create: (serviceId: string, input: TInput): Promise<TRow> => httpPost(`${BASE}/services/${serviceId}/${path}`, input),
    update: (serviceId: string, id: number, patch: TPatch): Promise<TRow> =>
      httpPatch(`${BASE}/services/${serviceId}/${path}/${id}`, patch),
    remove: (serviceId: string, id: number): Promise<void> => httpDelete(`${BASE}/services/${serviceId}/${path}/${id}`),
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

  getBranches: async (params: BranchListParams = {}): Promise<BranchListResult> => {
    const { data, meta } = await httpGet<{ data: Branch[]; meta: { total: number } }>(`${BASE}/branches${toBranchQuery(params)}`);
    return { data, total: meta.total };
  },
  createBranch: (input: BranchInput): Promise<Branch> => httpPost(`${BASE}/branches`, input),
  updateBranch: (branchId: string, patch: BranchPatch): Promise<Branch> => httpPatch(`${BASE}/branches/${branchId}`, patch),
  linkExistingBranch: (input: LinkExistingBranchInput): Promise<LinkExistingBranchResult> =>
    httpPost(`${BASE}/branches/link-existing`, input),
  deleteBranch: (branchId: string): Promise<void> => httpDelete(`${BASE}/branches/${branchId}`),

  searchServices: async (params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    const { data, meta } = await httpGet<{ data: BusinessService[]; meta: { total: number } }>(`${BASE}/services/search${toServiceSearchQuery(params)}`);
    return { data, total: meta.total };
  },
  createService: (input: ServiceInput): Promise<BusinessService> => httpPost(`${BASE}/services`, input),
  updateService: (serviceId: string, patch: ServicePatch): Promise<BusinessService> =>
    httpPatch(`${BASE}/services/${serviceId}`, patch),
  deleteService: (serviceId: string): Promise<void> => httpDelete(`${BASE}/services/${serviceId}`),
  getServiceFieldValues: (serviceId: string): Promise<SchemaFieldValue[]> =>
    httpGet(`${BASE}/services/${serviceId}/field-values`),
  updateServiceFieldValues: (serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> =>
    httpPut(`${BASE}/services/${serviceId}/field-values`, { values }),

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

  getRoles: (): Promise<Role[]> => httpGet(`${BASE}/roles`),
  getPermissions: (): Promise<Permission[]> => httpGet(`${BASE}/roles/permissions`),
  createRole: (input: RoleCreateInput): Promise<Role> => httpPost(`${BASE}/roles`, input),
  updateRole: (roleId: number, patch: RolePatch): Promise<Role> => httpPatch(`${BASE}/roles/${roleId}`, patch),
  deleteRole: (roleId: number): Promise<void> => httpDelete(`${BASE}/roles/${roleId}`),

  getRelations: async (params: RelationListParams = {}): Promise<RelationListResult> => {
    const { data, meta } = await httpGet<{ data: BusinessRelation[]; meta: { total: number } }>(`${BASE}/partners${toRelationQuery(params)}`);
    return { data, total: meta.total };
  },
  createRelation: (input: RelationInput): Promise<BusinessRelation> => httpPost(`${BASE}/partners`, input),
  updateRelation: (relationId: string, patch: RelationPatch): Promise<BusinessRelation> =>
    httpPatch(`${BASE}/partners/${relationId}`, patch),
  deleteRelation: (relationId: string): Promise<void> => httpDelete(`${BASE}/partners/${relationId}`),

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

  getServiceAccreditations: (serviceId: string): Promise<ServiceAccreditationLink[]> =>
    httpGet(`${BASE}/services/${serviceId}/accreditations`),
  linkServiceAccreditation: (serviceId: string, accreditation_id: number): Promise<ServiceAccreditationLink> =>
    httpPost(`${BASE}/services/${serviceId}/accreditations`, { accreditation_id }),
  unlinkServiceAccreditation: (serviceId: string, id: number): Promise<void> =>
    httpDelete(`${BASE}/services/${serviceId}/accreditations/${id}`),

  getServiceCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/service-categories${toSearchListQuery({ limit: 10, ...params })}`),
  getLookups: (kind: LookupKind, params: SearchListParams = {}): Promise<Paginated<Lookup>> =>
    httpGet(`${BASE}/${kind}${toSearchListQuery(params)}`),
  getAccreditations: (params: SearchListParams = {}): Promise<Paginated<Accreditation>> =>
    httpGet(`${BASE}/accreditations${toSearchListQuery(params)}`),
};
