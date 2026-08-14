import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/lib/api/http";
import type {
  Accreditation, Category, Lookup, LookupKind, Paginated, SearchListParams,
} from "@/app/admin/platform/categories/apis/types";
import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceInput, ServicePatch,
  ServiceSearchParams, ServiceSearchResult,
} from "./types";

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

  getServiceCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/service-categories${toSearchListQuery({ limit: 10, ...params })}`),
  getLookups: (kind: LookupKind, params: SearchListParams = {}): Promise<Paginated<Lookup>> =>
    httpGet(`${BASE}/${kind}${toSearchListQuery(params)}`),
  getAccreditations: (params: SearchListParams = {}): Promise<Paginated<Accreditation>> =>
    httpGet(`${BASE}/accreditations${toSearchListQuery(params)}`),
};
