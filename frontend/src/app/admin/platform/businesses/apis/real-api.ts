import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPut } from "@/lib/api/http";
import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult,
  BranchPatch, Business, BusinessCreateInput, ListingRef, BusinessDetail, BusinessListParams, BusinessListResult, BusinessPatch, BusinessRelation,
  BusinessService, BusinessStatus, EnquirySettingsPatch, LinkExistingBranchInput, LinkExistingBranchResult, Member,
  MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceInput, ServicePatch,
  ServiceSearchParams, ServiceSearchResult,
} from "./types";

const BASE = "/admin/platform/businesses";

// The id spaces are separate — institution 3 and business 3 are different rows, so every
// row mutation routes by kind.
const listingBase = ({ kind, id }: ListingRef) =>
  kind === "institution" ? `/admin/platform/institutions/${id}` : `${BASE}/${id}`;

function toQuery(params: BusinessListParams): string {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 10) });
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  if (params.category) q.set("category", String(params.category));
  return `?${q.toString()}`;
}

function toBranchQuery(params: BranchListParams): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.filter_branch) q.set("filter_branch", params.filter_branch);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function toPageLimitQuery(params: { page?: number; limit?: number }): string {
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
  if (params.point_of_contact) q.set("point_of_contact", "true");
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const businessesRealApi = {
  getBusinesses: async (params: BusinessListParams = {}): Promise<BusinessListResult> => {
    const { data, meta } = await httpGet<{ data: Business[]; meta: { total: number } }>(`${BASE}${toQuery(params)}`);
    return { data, total: meta.total };
  },
  createBusiness: (input: BusinessCreateInput): Promise<BusinessDetail> => httpPost(BASE, input),
  uploadImage: (file: File): Promise<{ path: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${BASE}/image`, form);
  },
  getBusinessDetail: (id: number): Promise<BusinessDetail> => httpGet(`${BASE}/${id}`),
  updateBusiness: (id: number, patch: BusinessPatch): Promise<BusinessDetail> => httpPatch(`${BASE}/${id}`, patch),
  updateStatus: (ref: ListingRef, status: BusinessStatus): Promise<{ status: string }> =>
    httpPatch(`${listingBase(ref)}/status`, { status }),
  sendClaimRequest: (ref: ListingRef): Promise<{ claim_status: string }> =>
    httpPost(`${listingBase(ref)}/claim-request`, {}),
  sendBulkClaimRequests: (ids: number[]): Promise<{ queued: number }> => httpPost(`${BASE}/claim-requests/bulk`, { ids }),
  updatePublished: (ref: ListingRef, is_published: boolean): Promise<{ is_published: boolean }> =>
    httpPatch(`${listingBase(ref)}/published`, { is_published }),
  deleteBusiness: (ref: ListingRef): Promise<void> => httpDelete(listingBase(ref)),
  updateEnquirySettings: (id: number, patch: EnquirySettingsPatch): Promise<BusinessDetail> =>
    httpPatch(`${BASE}/${id}/enquiry-settings`, patch),

  getBranches: async (id: number, params: BranchListParams = {}): Promise<BranchListResult> => {
    const { data, meta } = await httpGet<{ data: Branch[]; meta: { total: number } }>(`${BASE}/${id}/branches${toBranchQuery(params)}`);
    return { data, total: meta.total };
  },
  createBranch: (id: number, input: BranchInput): Promise<Branch> => httpPost(`${BASE}/${id}/branches`, input),
  updateBranch: (id: number, branchId: string, patch: BranchPatch): Promise<Branch> => httpPatch(`${BASE}/${id}/branches/${branchId}`, patch),
  linkExistingBranch: (id: number, input: LinkExistingBranchInput): Promise<LinkExistingBranchResult> =>
    httpPost(`${BASE}/${id}/branches/link-existing`, input),
  deleteBranch: (id: number, branchId: string): Promise<void> => httpDelete(`${BASE}/${id}/branches/${branchId}`),

  getServices: (id: number): Promise<BusinessService[]> => httpGet(`${BASE}/${id}/services`),
  searchServices: async (id: number, params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    const { data, meta } = await httpGet<{ data: BusinessService[]; meta: { total: number } }>(`${BASE}/${id}/services/search${toServiceSearchQuery(params)}`);
    return { data, total: meta.total };
  },
  createService: (id: number, input: ServiceInput): Promise<BusinessService> => httpPost(`${BASE}/${id}/services`, input),
  updateService: (id: number, serviceId: string, patch: ServicePatch): Promise<BusinessService> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}`, patch),
  setServicePublished: (id: number, serviceId: string, is_published: boolean): Promise<BusinessService> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}`, { is_published }),
  deleteService: (id: number, serviceId: string): Promise<void> => httpDelete(`${BASE}/${id}/services/${serviceId}`),
  getServiceFieldValues: (id: number, serviceId: string): Promise<SchemaFieldValue[]> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/field-values`),
  updateServiceFieldValues: (id: number, serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> =>
    httpPut(`${BASE}/${id}/services/${serviceId}/field-values`, { values }),

  getMembers: async (id: number, params: MemberListParams = {}): Promise<MemberListResult> => {
    const { data, meta } = await httpGet<{ data: Member[]; meta: { total: number } }>(`${BASE}/${id}/members${toMemberQuery(params)}`);
    return { data, total: meta.total };
  },
  getMemberRoles: (id: number): Promise<MemberRole[]> => httpGet(`${BASE}/${id}/roles`),
  inviteMember: (id: number, input: MemberInviteInput): Promise<{ id: string; email: string; status: string }> =>
    httpPost(`${BASE}/${id}/members`, input),
  updateMember: (id: number, memberId: number, patch: MemberPatch): Promise<Member> =>
    httpPatch(`${BASE}/${id}/members/${memberId}`, patch),
  removeMember: (id: number, memberId: number): Promise<void> => httpDelete(`${BASE}/${id}/members/${memberId}`),

  getRelations: async (id: number, params: RelationListParams = {}): Promise<RelationListResult> => {
    const { data, meta } = await httpGet<{ data: BusinessRelation[]; meta: { total: number } }>(`${BASE}/${id}/relations${toPageLimitQuery(params)}`);
    return { data, total: meta.total };
  },
  createRelation: (id: number, input: RelationInput): Promise<BusinessRelation> => httpPost(`${BASE}/${id}/relations`, input),
  updateRelation: (id: number, relationId: string, patch: RelationPatch): Promise<BusinessRelation> =>
    httpPatch(`${BASE}/${id}/relations/${relationId}`, patch),
  deleteRelation: (id: number, relationId: string): Promise<void> => httpDelete(`${BASE}/${id}/relations/${relationId}`),

  getActivity: async (id: number, params: ActivityListParams = {}): Promise<ActivityListResult> => {
    const { data, meta } = await httpGet<{ data: ActivityLogEntry[]; meta: { total: number } }>(`${BASE}/${id}/activity${toPageLimitQuery(params)}`);
    return { data, total: meta.total };
  },
};
