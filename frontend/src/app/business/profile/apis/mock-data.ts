import { categoriesMockApi } from "@/app/admin/platform/categories/apis/mock-data";
import { uuid } from "@/lib/utils";
import type {
  ActivityListParams, ActivityListResult, Branch, BranchInput, BranchListParams, BranchListResult, BranchPatch,
  BusinessRelation, BusinessSearchParams, BusinessSearchResult, BusinessService, InvitationListResult, InvitedMember,
  LinkExistingBranchInput, LinkExistingBranchResult,
  Member, MemberInviteInput, MemberListParams, MemberListResult, MemberPatch, MemberRole,
  PartnerInstitutionCourse, PartnerInstitutionCourseListParams, PartnerInstitutionCourseListResult, PartnerInstitutionDetail, Permission,
  Role, RoleCreateInput, RolePatch,
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
// Mirrors backend/database/seeders/business/roles_seeder.ts
const mockPermissions: Permission[] = [
  { id: 1, module: "business", action: "read", display_name: "View Business Profile", description: "View business details and settings" },
  { id: 2, module: "business", action: "write", display_name: "Edit Business Profile", description: "Edit business details and settings" },
  { id: 3, module: "agents", action: "read", display_name: "View Team Members", description: "View agent/team member list" },
  { id: 4, module: "agents", action: "write", display_name: "Manage Team Members", description: "Invite and manage agents" },
  { id: 5, module: "agents", action: "delete", display_name: "Remove Team Members", description: "Remove agents from business" },
  { id: 6, module: "enquiries", action: "view", display_name: "View Enquiries", description: "View incoming student enquiries" },
  { id: 7, module: "enquiries", action: "unlock", display_name: "Unlock Enquiries", description: "Unlock enquiry contact details (spends credits)" },
  { id: 8, module: "enquiries", action: "respond", display_name: "Respond to Enquiries", description: "Reply to students in enquiry conversations" },
  { id: 9, module: "enquiries", action: "assign", display_name: "Assign Enquiries", description: "Assign enquiries to team members" },
  { id: 10, module: "enquiries", action: "convert", display_name: "Convert Enquiries", description: "Mark enquiries as converted" },
  { id: 11, module: "roles", action: "manage", display_name: "Manage Roles", description: "Create, edit and delete custom roles and their permissions" },
];
let mockRoleSeq = 6;
let mockCustomRoles: Role[] = [
  { id: 1, name: "owner", display_name: "Owner", description: "Business owner with full access", is_system: true, sort_order: 0, permission_ids: mockPermissions.map((p) => p.id), members_count: 1 },
  { id: 2, name: "admin", display_name: "Admin", description: "Administrative access", is_system: true, sort_order: 1, permission_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], members_count: 0 },
  { id: 3, name: "manager", display_name: "Manager", description: "Team and operations management", is_system: true, sort_order: 2, permission_ids: [1, 3, 6, 7, 8, 9, 10], members_count: 0 },
  { id: 4, name: "counsellor", display_name: "Counsellor", description: "Student counselling and support", is_system: true, sort_order: 3, permission_ids: [1, 6, 8, 10], members_count: 2 },
  { id: 5, name: "member", display_name: "Member", description: "Standard team member", is_system: true, sort_order: 4, permission_ids: [1, 6], members_count: 0 },
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
    const search = params.search?.toLowerCase();
    const filtered = search
      ? mockMembers.filter((m) => `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(search))
      : mockMembers;
    return { data: filtered, total: filtered.length };
  },
  getMemberRoles: async (): Promise<MemberRole[]> => {
    await delay(200);
    return mockRoles;
  },
  getRoles: async (_orgBase?: string): Promise<Role[]> => {
    console.log("[mock] GET /businesses/roles");
    await delay(250);
    return mockCustomRoles;
  },
  getPermissions: async (_orgBase?: string): Promise<Permission[]> => {
    console.log("[mock] GET /businesses/roles/permissions");
    await delay(200);
    return mockPermissions;
  },
  createRole: async (input: RoleCreateInput, _orgBase?: string): Promise<Role> => {
    console.log("[mock] POST /businesses/roles");
    await delay(300);
    const role: Role = {
      id: mockRoleSeq++,
      name: input.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      display_name: input.display_name.trim(),
      description: input.description ?? null,
      is_system: false,
      sort_order: mockCustomRoles.length,
      permission_ids: input.permission_ids,
      members_count: 0,
    };
    mockCustomRoles = [...mockCustomRoles, role];
    return role;
  },
  updateRole: async (roleId: number, patch: RolePatch, _orgBase?: string): Promise<Role> => {
    console.log(`[mock] PATCH /businesses/roles/${roleId}`);
    await delay(300);
    mockCustomRoles = mockCustomRoles.map((r) => (r.id === roleId ? { ...r, ...patch, description: patch.description ?? r.description } : r));
    return mockCustomRoles.find((r) => r.id === roleId)!;
  },
  deleteRole: async (roleId: number, _orgBase?: string): Promise<void> => {
    console.log(`[mock] DELETE /businesses/roles/${roleId}`);
    await delay(300);
    mockCustomRoles = mockCustomRoles.filter((r) => r.id !== roleId);
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

  getRelations: async (params: RelationListParams = {}, _orgBase?: string): Promise<RelationListResult> => {
    console.log("[mock] GET /businesses/partners", params);
    await delay(300);
    return { data: mockRelations, total: mockRelations.length };
  },
  createRelation: async (input: RelationInput, _orgBase?: string): Promise<BusinessRelation> => {
    await delay(300);
    const relation: BusinessRelation = {
      id: uuid(), status: "active", created_at: new Date().toISOString(),
      partner_kind: "business", partner_id: input.partner_business_id, partner_name: `Business #${input.partner_business_id}`, partner_logo_url: null,
      business_type: null, country_ids: input.country_ids ?? null, valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null, notes: input.notes ?? null,
    };
    mockRelations = [...mockRelations, relation];
    return relation;
  },
  updateRelation: async (relationId: string, patch: RelationPatch, _orgBase?: string): Promise<BusinessRelation> => {
    await delay(300);
    mockRelations = mockRelations.map((r) => (r.id === relationId ? { ...r, ...patch } : r));
    return mockRelations.find((r) => r.id === relationId)!;
  },
  deleteRelation: async (relationId: string, _orgBase?: string): Promise<void> => {
    await delay(300);
    mockRelations = mockRelations.filter((r) => r.id !== relationId);
  },

  getPartnerInstitutionDetail: async (institutionId: number): Promise<PartnerInstitutionDetail> => {
    console.log("[mock] GET /businesses/partners/institutions/:id", institutionId);
    await delay(300);
    return {
      id: institutionId, institution_name: `Institution #${institutionId}`, email: "admissions@example.edu",
      phone: "+1 604 555 0110", website: "https://example.edu", description: "A partner institution.",
      country_id: null, state: null, city: null, address: null, logo_url: null, cover_url: null,
    };
  },
  getPartnerInstitutionCourses: async (
    _institutionId: number,
    params: PartnerInstitutionCourseListParams = {},
  ): Promise<PartnerInstitutionCourseListResult> => {
    console.log("[mock] GET /businesses/partners/institutions/:id/courses", params);
    await delay(300);
    const courses: PartnerInstitutionCourse[] = [
      {
        id: "course-1", slug: "bachelor-of-business-abc123", name: "Bachelor of Business", degree_level: "Bachelor", subject_area: "Business",
        duration_weeks: 156, study_mode: "on_campus", domestic_fee_total: 28000, domestic_currency: "AUD",
        verification_status: "verified", source_url: null,
      },
    ];
    const filtered = params.search ? courses.filter((c) => c.name.toLowerCase().includes(params.search!.toLowerCase())) : courses;
    return { data: filtered, total: filtered.length };
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
