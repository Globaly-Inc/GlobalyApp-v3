import { categoriesMockApi } from "@/app/admin/platform/categories/apis/mock-data";
import { uuid } from "@/lib/utils";
import type {
  ActivityListParams, ActivityListResult, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, InvitationListResult, InvitedMember,
  LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, Scholarship, ScholarshipInput,
  ScholarshipListParams, ScholarshipListResult, ScholarshipPatch, ServiceAccreditationLink, ServiceEligibility,
  ServiceEligibilityInput, ServiceEligibilityPatch, ServiceFee, ServiceFeeInput, ServiceFeePatch, ServiceInput,
  ServiceIntake, ServiceIntakeInput, ServiceIntakePatch, ServicePatch, ServiceSearchParams, ServiceSearchResult,
  ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch, ServiceStudyUnit, ServiceStudyUnitInput,
  ServiceStudyUnitPatch,
} from "./types";

let mockChildSeq = 1;
let mockServiceAccreditations: (ServiceAccreditationLink & { __serviceId: string })[] = [];
/** Generic in-memory CRUD for one service child resource, keyed by serviceId. */
function makeChildMockApi<TRow extends { id: number }, TInput, TPatch>(label: string) {
  let rows: (TRow & { __serviceId: string })[] = [];
  return {
    list: async (serviceId: string): Promise<TRow[]> => {
      console.log(`[mock] GET /businesses/services/${serviceId}/${label}`);
      await delay(200);
      return rows.filter((r) => r.__serviceId === serviceId);
    },
    create: async (serviceId: string, input: TInput): Promise<TRow> => {
      await delay(200);
      const row = { ...(input as object), id: mockChildSeq++, __serviceId: serviceId } as TRow & { __serviceId: string };
      rows = [...rows, row];
      return row;
    },
    update: async (serviceId: string, id: number, patch: TPatch): Promise<TRow> => {
      await delay(200);
      rows = rows.map((r) => (r.id === id && r.__serviceId === serviceId ? { ...r, ...patch } : r));
      return rows.find((r) => r.id === id)!;
    },
    remove: async (serviceId: string, id: number): Promise<void> => {
      await delay(200);
      rows = rows.filter((r) => !(r.id === id && r.__serviceId === serviceId));
    },
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockBranches: Branch[] = [
  {
    id: "b1", name: "Head Office", country: "Australia", state: "NSW", city: "Sydney", address: "1 Main St",
    phone: null, email: null, is_primary: true, linked_business_id: null, branch_type: "same_company",
    share_description: false, shared_services: "all", created_at: new Date(2026, 0, 1).toISOString(),
  },
];

let mockServices: BusinessService[] = [];
let mockMembers: Member[] = [];
const mockRoles: MemberRole[] = [
  { id: 1, name: "owner", display_name: "Owner" },
  { id: 2, name: "member", display_name: "Member" },
];
let mockInvitations: InvitedMember[] = [
  {
    id: uuid(), first_name: "Sam", last_name: "Taylor", email: "sam.taylor@example.com", phone: null,
    role: "member", admin_point_of_contact: false,
    invited_at: new Date(2026, 7, 1).toISOString(), expires_at: new Date(2026, 7, 4).toISOString(),
  },
];
let mockRelations: BusinessRelation[] = [];
const mockSearchableBusinesses: BusinessSearchResult[] = [
  { id: 101, business_name: "Acme Education Consultants", logo_url: null },
  { id: 102, business_name: "Global Study Advisors", logo_url: null },
];
const mockActivity: { id: string; action: string; details: Record<string, unknown>; created_at: string; admin_first_name: string | null; admin_last_name: string | null }[] = [];
let mockScholarships: Scholarship[] = [];
let mockScholarshipSeq = 1;

export const businessProfileDetailMockApi = {
  searchBusinesses: async (params: BusinessSearchParams = {}): Promise<BusinessSearchResult[]> => {
    console.log("[mock] GET /businesses/search", params);
    await delay(300);
    const q = params.search?.toLowerCase() ?? "";
    return mockSearchableBusinesses.filter((b) => b.business_name.toLowerCase().includes(q));
  },

  getBranches: async (params: BranchListParams = {}): Promise<BranchListResult> => {
    console.log("[mock] GET /businesses/branches", params);
    await delay(300);
    return { data: mockBranches, total: mockBranches.length };
  },
  createBranch: async (input: BranchInput): Promise<Branch> => {
    await delay(300);
    const branch: Branch = {
      id: uuid(), name: input.name, country: input.country ?? null, state: input.state ?? null,
      city: input.city ?? null, address: input.address ?? null, phone: input.phone ?? null, email: input.email ?? null,
      is_primary: false, linked_business_id: null, branch_type: input.branch_type ?? "same_company",
      share_description: input.share_description ?? false, shared_services: input.shared_services ?? "all",
      created_at: new Date().toISOString(),
    };
    mockBranches = [...mockBranches, branch];
    return branch;
  },
  updateBranch: async (branchId: string, patch: BranchPatch): Promise<Branch> => {
    await delay(300);
    mockBranches = mockBranches.map((b) => (b.id === branchId ? { ...b, ...patch } : b));
    return mockBranches.find((b) => b.id === branchId)!;
  },
  linkExistingBranch: async (input: LinkExistingBranchInput): Promise<LinkExistingBranchResult> => {
    await delay(300);
    const branch: Branch = {
      id: uuid(), name: "Linked business", country: null, state: null, city: null, address: null,
      phone: null, email: null, is_primary: false, linked_business_id: input.business_id, branch_type: input.branch_type,
      share_description: false, shared_services: input.shared_services, created_at: new Date().toISOString(),
    };
    mockBranches = [...mockBranches, branch];
    return { branch };
  },
  deleteBranch: async (branchId: string): Promise<void> => {
    await delay(300);
    mockBranches = mockBranches.filter((b) => b.id !== branchId);
  },

  searchServices: async (params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    console.log("[mock] GET /businesses/services/search", params);
    await delay(300);
    return { data: mockServices, total: mockServices.length };
  },
  createService: async (input: ServiceInput): Promise<BusinessService> => {
    await delay(300);
    const service: BusinessService = {
      id: uuid(), service_category_id: input.service_category_id, category_name: null, name: input.name,
      description: input.description ?? null, price: input.price != null ? String(input.price) : null,
      is_published: false, public_visibility: {}, degree_level: null, area_of_study: null, duration: null,
      created_at: new Date().toISOString(),
    };
    mockServices = [service, ...mockServices];
    return service;
  },
  updateService: async (serviceId: string, patch: ServicePatch): Promise<BusinessService> => {
    await delay(300);
    mockServices = mockServices.map((s) => (s.id === serviceId ? { ...s, ...patch, price: patch.price != null ? String(patch.price) : s.price } : s));
    return mockServices.find((s) => s.id === serviceId)!;
  },
  deleteService: async (serviceId: string): Promise<void> => {
    await delay(300);
    mockServices = mockServices.filter((s) => s.id !== serviceId);
  },
  getServiceFieldValues: async (_serviceId: string): Promise<SchemaFieldValue[]> => {
    await delay(100);
    return [];
  },
  updateServiceFieldValues: async (_serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> => {
    await delay(150);
    return values;
  },

  getMembers: async (params: MemberListParams = {}): Promise<MemberListResult> => {
    console.log("[mock] GET /businesses/members", params);
    await delay(300);
    return { data: mockMembers, total: mockMembers.length };
  },
  getMemberRoles: async (): Promise<MemberRole[]> => {
    await delay(200);
    return mockRoles;
  },
  inviteMember: async (input: MemberInviteInput): Promise<{ id: string; email: string; status: string }> => {
    await delay(300);
    const invitation: InvitedMember = {
      id: uuid(), first_name: input.first_name, last_name: input.last_name, email: input.email,
      phone: input.phone ?? null, role: input.role, admin_point_of_contact: input.admin_point_of_contact ?? false,
      invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    mockInvitations = [...mockInvitations, invitation];
    return { id: invitation.id, email: input.email, status: "invited" };
  },
  updateMember: async (memberId: number, patch: MemberPatch): Promise<Member> => {
    await delay(300);
    mockMembers = mockMembers.map((m) => (m.id === memberId ? { ...m, ...patch, role: patch.role ?? m.role, role_display: patch.role ?? m.role_display } : m));
    return mockMembers.find((m) => m.id === memberId)!;
  },
  removeMember: async (memberId: number): Promise<void> => {
    await delay(300);
    mockMembers = mockMembers.filter((m) => m.id !== memberId);
  },

  getInvitations: async (params: MemberListParams = {}): Promise<InvitationListResult> => {
    console.log("[mock] GET /businesses/members/invitations", params);
    await delay(300);
    return { data: mockInvitations, total: mockInvitations.length };
  },
  cancelInvitation: async (invitationId: string): Promise<void> => {
    await delay(300);
    mockInvitations = mockInvitations.filter((i) => i.id !== invitationId);
  },
  resendInvitation: async (_invitationId: string): Promise<void> => {
    await delay(300);
  },

  getRelations: async (params: RelationListParams = {}): Promise<RelationListResult> => {
    console.log("[mock] GET /businesses/partners", params);
    await delay(300);
    return { data: mockRelations, total: mockRelations.length };
  },
  createRelation: async (input: RelationInput): Promise<BusinessRelation> => {
    await delay(300);
    const relation: BusinessRelation = {
      id: uuid(), status: "active", relation_type: input.relation_type, created_at: new Date().toISOString(),
      business_id: input.partner_business_id, business_name: `Business #${input.partner_business_id}`, logo_url: null,
      business_type: null, country_ids: input.country_ids ?? null, valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null, notes: input.notes ?? null,
    };
    mockRelations = [...mockRelations, relation];
    return relation;
  },
  updateRelation: async (relationId: string, patch: RelationPatch): Promise<BusinessRelation> => {
    await delay(300);
    mockRelations = mockRelations.map((r) => (r.id === relationId ? { ...r, ...patch } : r));
    return mockRelations.find((r) => r.id === relationId)!;
  },
  deleteRelation: async (relationId: string): Promise<void> => {
    await delay(300);
    mockRelations = mockRelations.filter((r) => r.id !== relationId);
  },

  getActivity: async (params: ActivityListParams = {}): Promise<ActivityListResult> => {
    console.log("[mock] GET /businesses/activity", params);
    await delay(300);
    return { data: mockActivity, total: mockActivity.length };
  },

  getScholarships: async (params: ScholarshipListParams = {}): Promise<ScholarshipListResult> => {
    console.log("[mock] GET /businesses/scholarships", params);
    await delay(300);
    const q = params.search?.toLowerCase() ?? "";
    const filtered = q ? mockScholarships.filter((s) => s.title.toLowerCase().includes(q)) : mockScholarships;
    return { data: filtered, total: filtered.length };
  },
  createScholarship: async (input: ScholarshipInput): Promise<Scholarship> => {
    await delay(300);
    const scholarship: Scholarship = {
      id: mockScholarshipSeq++, title: input.title, slug: input.slug, description: input.description ?? null,
      provider_name: input.provider_name ?? null, source_type: input.source_type ?? "university",
      country: input.country ?? null, city: input.city ?? null, region: input.region ?? null,
      basis: input.basis ?? null, degree_levels: input.degree_levels ?? [],
      requirements_summary: input.requirements_summary ?? null, coverage_type: input.coverage_type ?? "various",
      coverage_amount: input.coverage_amount ?? null, coverage_currency: input.coverage_currency ?? "USD",
      coverage_description: input.coverage_description ?? null, deadline: input.deadline ?? null,
      deadline_notes: input.deadline_notes ?? null, application_url: input.application_url ?? null,
      source_url: input.source_url ?? null, is_published: input.is_published ?? false,
      is_featured: input.is_featured ?? false, view_count: 0,
      created_at: new Date().toISOString(),
    };
    mockScholarships = [scholarship, ...mockScholarships];
    return scholarship;
  },
  updateScholarship: async (scholarshipId: number, patch: ScholarshipPatch): Promise<Scholarship> => {
    await delay(300);
    mockScholarships = mockScholarships.map((s) => (s.id === scholarshipId ? { ...s, ...patch } : s));
    return mockScholarships.find((s) => s.id === scholarshipId)!;
  },
  deleteScholarship: async (scholarshipId: number): Promise<void> => {
    await delay(300);
    mockScholarships = mockScholarships.filter((s) => s.id !== scholarshipId);
  },

  serviceFees: makeChildMockApi<ServiceFee, ServiceFeeInput, ServiceFeePatch>("fees"),
  serviceIntakes: makeChildMockApi<ServiceIntake, ServiceIntakeInput, ServiceIntakePatch>("intakes"),
  serviceEligibility: makeChildMockApi<ServiceEligibility, ServiceEligibilityInput, ServiceEligibilityPatch>("eligibility"),
  serviceStudyOptions: makeChildMockApi<ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch>("study-options"),
  serviceStudyUnits: makeChildMockApi<ServiceStudyUnit, ServiceStudyUnitInput, ServiceStudyUnitPatch>("study-units"),

  getServiceAccreditations: async (serviceId: string): Promise<ServiceAccreditationLink[]> => {
    await delay(200);
    return mockServiceAccreditations.filter((a) => a.__serviceId === serviceId);
  },
  linkServiceAccreditation: async (serviceId: string, accreditation_id: number): Promise<ServiceAccreditationLink> => {
    await delay(200);
    const link = { id: mockChildSeq++, accreditation_id, __serviceId: serviceId };
    mockServiceAccreditations = [...mockServiceAccreditations, link];
    return link;
  },
  unlinkServiceAccreditation: async (serviceId: string, id: number): Promise<void> => {
    await delay(200);
    mockServiceAccreditations = mockServiceAccreditations.filter((a) => !(a.id === id && a.__serviceId === serviceId));
  },

  getServiceCategories: categoriesMockApi.getServiceCategories,
  getLookups: categoriesMockApi.getLookups,
  getAccreditations: categoriesMockApi.getAccreditations,
};
