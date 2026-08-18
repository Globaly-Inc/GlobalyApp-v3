import { categoriesMockApi } from "@/app/admin/platform/categories/apis/mock-data";
import type {
  ActivityListParams, ActivityListResult, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, InvitationListResult, InvitedMember,
  LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceInput, ServicePatch,
  ServiceSearchParams, ServiceSearchResult,
} from "./types";

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
    id: crypto.randomUUID(), first_name: "Sam", last_name: "Taylor", email: "sam.taylor@example.com", phone: null,
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
      id: crypto.randomUUID(), name: input.name, country: input.country ?? null, state: input.state ?? null,
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
      id: crypto.randomUUID(), name: "Linked business", country: null, state: null, city: null, address: null,
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
      id: crypto.randomUUID(), service_category_id: input.service_category_id, category_name: null, name: input.name,
      description: input.description ?? null, price: input.price != null ? String(input.price) : null,
      is_published: false, created_at: new Date().toISOString(),
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
  getServiceFieldValues: async (): Promise<SchemaFieldValue[]> => {
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
      id: crypto.randomUUID(), first_name: input.first_name, last_name: input.last_name, email: input.email,
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

  getRelations: async (params: RelationListParams = {}): Promise<RelationListResult> => {
    console.log("[mock] GET /businesses/partners", params);
    await delay(300);
    return { data: mockRelations, total: mockRelations.length };
  },
  createRelation: async (input: RelationInput): Promise<BusinessRelation> => {
    await delay(300);
    const relation: BusinessRelation = {
      id: crypto.randomUUID(), status: "active", relation_type: input.relation_type, created_at: new Date().toISOString(),
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

  getServiceCategories: categoriesMockApi.getServiceCategories,
  getLookups: categoriesMockApi.getLookups,
  getAccreditations: categoriesMockApi.getAccreditations,
};
