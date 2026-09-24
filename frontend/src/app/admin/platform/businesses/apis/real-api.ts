import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPut } from "@/lib/api/http";
import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult,
  BranchPatch, Business, BusinessCreateInput, ListingRef, BusinessDetail, BusinessListParams, BusinessListResult, BusinessPatch, BusinessRelation,
  BusinessService, BusinessStatus, Contact, ContactInput, ContactListParams, ContactListResult, ContactPatch,
  EnquirySettingsPatch, InstitutionBranchListParams, InstitutionBranchListResult, InstitutionCourseListParams, InstitutionCourseListResult, InstitutionDetail,
  ListingKind,
  InstitutionInvitation, InstitutionInvitationListParams, InstitutionInvitationListResult, InstitutionInviteInput,
  InstitutionPartnerInput, InstitutionPartnerListParams, InstitutionPartnerListResult, InstitutionPartnerPatch, InstitutionPartnerRow, InstitutionPatch,
  InstitutionPermission, InstitutionRole, InstitutionRoleCreateInput, InstitutionRolePatch,
  LinkExistingBranchInput, LinkExistingBranchResult, Member,
  MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceAccreditation, ServiceAccreditationInput,
  ServiceAiAssistInput, ServiceAiAssistResult, ServiceEligibility, ServiceEligibilityInput, ServiceEligibilityPatch,
  ServiceFee, ServiceFeeInput, ServiceFeePatch, ServiceInput, ServiceIntake, ServiceIntakeInput, ServiceIntakePatch, ServiceMediaFile, ServicePatch,
  ServiceSearchParams, ServiceSearchResult, ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch,
  ServiceStudyUnit, ServiceStudyUnitInput, ServiceStudyUnitPatch,
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
  if (params.kind) q.set("kind", params.kind);
  if (params.business_type) q.set("business_type", params.business_type);
  if (params.sort) q.set("sort", params.sort);
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

function toContactQuery(params: ContactListParams): string {
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
  getInstitutionDetail: (id: number): Promise<InstitutionDetail> => httpGet(`/admin/platform/institutions/${id}`),
  getListingKind: (id: number): Promise<{ kind: ListingKind }> => httpGet(`/admin/platform/listings/${id}/kind`),
  updateInstitution: (id: number, patch: InstitutionPatch): Promise<InstitutionDetail> =>
    httpPatch(`/admin/platform/institutions/${id}`, patch),
  getInstitutionMembers: async (id: number, params: MemberListParams = {}): Promise<MemberListResult> => {
    const { data, meta } = await httpGet<{ data: Member[]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/members${toMemberQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  getInstitutionCourses: async (id: number, params: InstitutionCourseListParams = {}): Promise<InstitutionCourseListResult> => {
    const { data, meta } = await httpGet<{ data: InstitutionCourseListResult["data"]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/courses${toMemberQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  getInstitutionBranches: async (id: number, params: InstitutionBranchListParams = {}): Promise<InstitutionBranchListResult> => {
    const { data, meta } = await httpGet<{ data: InstitutionBranchListResult["data"]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/branches${toMemberQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  getInstitutionPartners: async (id: number, params: InstitutionPartnerListParams = {}): Promise<InstitutionPartnerListResult> => {
    const { data, meta } = await httpGet<{ data: InstitutionPartnerRow[]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/partners${toMemberQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  createInstitutionPartner: (id: number, input: InstitutionPartnerInput): Promise<BusinessRelation> =>
    httpPost(`/admin/platform/institutions/${id}/partners`, input),
  updateInstitutionPartner: (id: number, partnerId: string, patch: InstitutionPartnerPatch): Promise<BusinessRelation> =>
    httpPatch(`/admin/platform/institutions/${id}/partners/${partnerId}`, patch),
  deleteInstitutionPartner: (id: number, partnerId: string): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/partners/${partnerId}`),
  inviteInstitutionMember: (id: number, input: InstitutionInviteInput): Promise<{ id: string; email: string; status: string }> =>
    httpPost(`/admin/platform/institutions/${id}/invite`, input),
  getInstitutionInvitations: async (id: number, params: InstitutionInvitationListParams = {}): Promise<InstitutionInvitationListResult> => {
    const { data, meta } = await httpGet<{ data: InstitutionInvitation[]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/invitations${toPageLimitQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  cancelInstitutionInvitation: (id: number, invitationId: string): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/invitations/${invitationId}`),
  resendInstitutionInvitation: (id: number, invitationId: string): Promise<void> =>
    httpPost(`/admin/platform/institutions/${id}/invitations/${invitationId}/resend`, {}),
  setInstitutionMemberStatus: (id: number, platformUserId: number, accountStatus: number): Promise<void> =>
    httpPatch(`/admin/platform/institutions/${id}/members/${platformUserId}/status`, { account_status: accountStatus }),

  getInstitutionRoles: (id: number): Promise<InstitutionRole[]> =>
    httpGet(`/admin/platform/institutions/${id}/roles`),
  getInstitutionPermissions: (id: number): Promise<InstitutionPermission[]> =>
    httpGet(`/admin/platform/institutions/${id}/roles/permissions`),
  createInstitutionRole: (id: number, input: InstitutionRoleCreateInput): Promise<InstitutionRole> =>
    httpPost(`/admin/platform/institutions/${id}/roles`, input),
  updateInstitutionRole: (id: number, roleId: number, patch: InstitutionRolePatch): Promise<InstitutionRole> =>
    httpPatch(`/admin/platform/institutions/${id}/roles/${roleId}`, patch),
  deleteInstitutionRole: (id: number, roleId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/roles/${roleId}`),
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
  generateServiceDescription: (input: ServiceAiAssistInput): Promise<ServiceAiAssistResult> =>
    httpPost("/admin/platform/services/ai-assist", input),

  getServiceFees: (id: number, serviceId: string): Promise<ServiceFee[]> => httpGet(`${BASE}/${id}/services/${serviceId}/fees`),
  createServiceFee: (id: number, serviceId: string, input: ServiceFeeInput): Promise<ServiceFee> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/fees`, input),
  updateServiceFee: (id: number, serviceId: string, feeId: number, patch: ServiceFeePatch): Promise<ServiceFee> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}/fees/${feeId}`, patch),
  deleteServiceFee: (id: number, serviceId: string, feeId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/fees/${feeId}`),

  getServiceIntakes: (id: number, serviceId: string): Promise<ServiceIntake[]> => httpGet(`${BASE}/${id}/services/${serviceId}/intakes`),
  createServiceIntake: (id: number, serviceId: string, input: ServiceIntakeInput): Promise<ServiceIntake> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/intakes`, input),
  updateServiceIntake: (id: number, serviceId: string, intakeId: number, patch: ServiceIntakePatch): Promise<ServiceIntake> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}/intakes/${intakeId}`, patch),
  deleteServiceIntake: (id: number, serviceId: string, intakeId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/intakes/${intakeId}`),

  getServiceEligibility: (id: number, serviceId: string): Promise<ServiceEligibility[]> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/eligibility`),
  createServiceEligibility: (id: number, serviceId: string, input: ServiceEligibilityInput): Promise<ServiceEligibility> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/eligibility`, input),
  updateServiceEligibility: (id: number, serviceId: string, eligibilityId: number, patch: ServiceEligibilityPatch): Promise<ServiceEligibility> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}/eligibility/${eligibilityId}`, patch),
  deleteServiceEligibility: (id: number, serviceId: string, eligibilityId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/eligibility/${eligibilityId}`),

  getServiceStudyOptions: (id: number, serviceId: string): Promise<ServiceStudyOption[]> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/study-options`),
  createServiceStudyOption: (id: number, serviceId: string, input: ServiceStudyOptionInput): Promise<ServiceStudyOption> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/study-options`, input),
  updateServiceStudyOption: (id: number, serviceId: string, optionId: number, patch: ServiceStudyOptionPatch): Promise<ServiceStudyOption> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}/study-options/${optionId}`, patch),
  deleteServiceStudyOption: (id: number, serviceId: string, optionId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/study-options/${optionId}`),

  getServiceStudyUnits: (id: number, serviceId: string): Promise<ServiceStudyUnit[]> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/study-units`),
  createServiceStudyUnit: (id: number, serviceId: string, input: ServiceStudyUnitInput): Promise<ServiceStudyUnit> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/study-units`, input),
  updateServiceStudyUnit: (id: number, serviceId: string, unitId: number, patch: ServiceStudyUnitPatch): Promise<ServiceStudyUnit> =>
    httpPatch(`${BASE}/${id}/services/${serviceId}/study-units/${unitId}`, patch),
  deleteServiceStudyUnit: (id: number, serviceId: string, unitId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/study-units/${unitId}`),

  getServiceAccreditations: (id: number, serviceId: string): Promise<ServiceAccreditation[]> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/accreditations`),
  createServiceAccreditation: (id: number, serviceId: string, input: ServiceAccreditationInput): Promise<ServiceAccreditation> =>
    httpPost(`${BASE}/${id}/services/${serviceId}/accreditations`, input),
  deleteServiceAccreditation: (id: number, serviceId: string, rowId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/accreditations/${rowId}`),

  getServiceMedia: (id: number, serviceId: string): Promise<{ files: ServiceMediaFile[] }> =>
    httpGet(`${BASE}/${id}/services/${serviceId}/media`),
  uploadServiceMedia: (id: number, serviceId: string, file: File): Promise<ServiceMediaFile> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${BASE}/${id}/services/${serviceId}/media`, form);
  },
  deleteServiceMedia: (id: number, serviceId: string, fileId: number): Promise<void> =>
    httpDelete(`${BASE}/${id}/services/${serviceId}/media/${fileId}`),

  getContacts: async (id: number, params: ContactListParams = {}): Promise<ContactListResult> => {
    const { data, meta } = await httpGet<{ data: Contact[]; meta: { total: number } }>(`${BASE}/${id}/contacts${toContactQuery(params)}`);
    return { data, total: meta.total };
  },
  createContact: (id: number, input: ContactInput): Promise<Contact> => httpPost(`${BASE}/${id}/contacts`, input),
  updateContact: (id: number, contactId: string, patch: ContactPatch): Promise<Contact> =>
    httpPatch(`${BASE}/${id}/contacts/${contactId}`, patch),
  deleteContact: (id: number, contactId: string): Promise<void> => httpDelete(`${BASE}/${id}/contacts/${contactId}`),

  getInstitutionContacts: async (id: number, params: ContactListParams = {}): Promise<ContactListResult> => {
    const { data, meta } = await httpGet<{ data: Contact[]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/contacts${toContactQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  createInstitutionContact: (id: number, input: ContactInput): Promise<Contact> =>
    httpPost(`/admin/platform/institutions/${id}/contacts`, input),
  updateInstitutionContact: (id: number, contactId: string, patch: ContactPatch): Promise<Contact> =>
    httpPatch(`/admin/platform/institutions/${id}/contacts/${contactId}`, patch),
  deleteInstitutionContact: (id: number, contactId: string): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/contacts/${contactId}`),

  // Institution twins — same business_services tenant table, own /admin/platform/institutions prefix
  // (ids collide with businesses, so they can't share the /businesses path — see listingBase above).
  getInstitutionServices: (id: number): Promise<BusinessService[]> => httpGet(`/admin/platform/institutions/${id}/services`),
  searchInstitutionServices: async (id: number, params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    const { data, meta } = await httpGet<{ data: BusinessService[]; meta: { total: number } }>(
      `/admin/platform/institutions/${id}/services/search${toServiceSearchQuery(params)}`,
    );
    return { data, total: meta.total };
  },
  createInstitutionService: (id: number, input: ServiceInput): Promise<BusinessService> =>
    httpPost(`/admin/platform/institutions/${id}/services`, input),
  updateInstitutionService: (id: number, serviceId: string, patch: ServicePatch): Promise<BusinessService> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}`, patch),
  setInstitutionServicePublished: (id: number, serviceId: string, is_published: boolean): Promise<BusinessService> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}`, { is_published }),
  deleteInstitutionService: (id: number, serviceId: string): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}`),
  getInstitutionServiceFieldValues: (id: number, serviceId: string): Promise<SchemaFieldValue[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/field-values`),
  updateInstitutionServiceFieldValues: (id: number, serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> =>
    httpPut(`/admin/platform/institutions/${id}/services/${serviceId}/field-values`, { values }),
  getInstitutionServiceFees: (id: number, serviceId: string): Promise<ServiceFee[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/fees`),
  createInstitutionServiceFee: (id: number, serviceId: string, input: ServiceFeeInput): Promise<ServiceFee> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/fees`, input),
  updateInstitutionServiceFee: (id: number, serviceId: string, feeId: number, patch: ServiceFeePatch): Promise<ServiceFee> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}/fees/${feeId}`, patch),
  deleteInstitutionServiceFee: (id: number, serviceId: string, feeId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/fees/${feeId}`),
  getInstitutionServiceIntakes: (id: number, serviceId: string): Promise<ServiceIntake[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/intakes`),
  createInstitutionServiceIntake: (id: number, serviceId: string, input: ServiceIntakeInput): Promise<ServiceIntake> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/intakes`, input),
  updateInstitutionServiceIntake: (id: number, serviceId: string, intakeId: number, patch: ServiceIntakePatch): Promise<ServiceIntake> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}/intakes/${intakeId}`, patch),
  deleteInstitutionServiceIntake: (id: number, serviceId: string, intakeId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/intakes/${intakeId}`),

  getInstitutionServiceEligibility: (id: number, serviceId: string): Promise<ServiceEligibility[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/eligibility`),
  createInstitutionServiceEligibility: (id: number, serviceId: string, input: ServiceEligibilityInput): Promise<ServiceEligibility> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/eligibility`, input),
  updateInstitutionServiceEligibility: (id: number, serviceId: string, eligibilityId: number, patch: ServiceEligibilityPatch): Promise<ServiceEligibility> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}/eligibility/${eligibilityId}`, patch),
  deleteInstitutionServiceEligibility: (id: number, serviceId: string, eligibilityId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/eligibility/${eligibilityId}`),

  getInstitutionServiceStudyOptions: (id: number, serviceId: string): Promise<ServiceStudyOption[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/study-options`),
  createInstitutionServiceStudyOption: (id: number, serviceId: string, input: ServiceStudyOptionInput): Promise<ServiceStudyOption> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/study-options`, input),
  updateInstitutionServiceStudyOption: (id: number, serviceId: string, optionId: number, patch: ServiceStudyOptionPatch): Promise<ServiceStudyOption> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}/study-options/${optionId}`, patch),
  deleteInstitutionServiceStudyOption: (id: number, serviceId: string, optionId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/study-options/${optionId}`),

  getInstitutionServiceStudyUnits: (id: number, serviceId: string): Promise<ServiceStudyUnit[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/study-units`),
  createInstitutionServiceStudyUnit: (id: number, serviceId: string, input: ServiceStudyUnitInput): Promise<ServiceStudyUnit> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/study-units`, input),
  updateInstitutionServiceStudyUnit: (id: number, serviceId: string, unitId: number, patch: ServiceStudyUnitPatch): Promise<ServiceStudyUnit> =>
    httpPatch(`/admin/platform/institutions/${id}/services/${serviceId}/study-units/${unitId}`, patch),
  deleteInstitutionServiceStudyUnit: (id: number, serviceId: string, unitId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/study-units/${unitId}`),

  getInstitutionServiceAccreditations: (id: number, serviceId: string): Promise<ServiceAccreditation[]> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/accreditations`),
  createInstitutionServiceAccreditation: (id: number, serviceId: string, input: ServiceAccreditationInput): Promise<ServiceAccreditation> =>
    httpPost(`/admin/platform/institutions/${id}/services/${serviceId}/accreditations`, input),
  deleteInstitutionServiceAccreditation: (id: number, serviceId: string, rowId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/accreditations/${rowId}`),

  getInstitutionServiceMedia: (id: number, serviceId: string): Promise<{ files: ServiceMediaFile[] }> =>
    httpGet(`/admin/platform/institutions/${id}/services/${serviceId}/media`),
  uploadInstitutionServiceMedia: (id: number, serviceId: string, file: File): Promise<ServiceMediaFile> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`/admin/platform/institutions/${id}/services/${serviceId}/media`, form);
  },
  deleteInstitutionServiceMedia: (id: number, serviceId: string, fileId: number): Promise<void> =>
    httpDelete(`/admin/platform/institutions/${id}/services/${serviceId}/media/${fileId}`),

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
    const { data, meta } = await httpGet<{ data: BusinessRelation[]; meta: { total: number } }>(`${BASE}/${id}/relations${toMemberQuery(params)}`);
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
