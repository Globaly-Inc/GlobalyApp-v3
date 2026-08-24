import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult,
  BranchPatch, Business, BusinessCreateInput, BusinessDetail, BusinessListParams, BusinessListResult, BusinessPatch, BusinessRelation,
  BusinessService, EnquirySettingsPatch, InstitutionCourse, InstitutionCourseListParams, InstitutionCourseListResult, InstitutionDetail,
  InstitutionInvitation, InstitutionInvitationListParams, InstitutionInvitationListResult, InstitutionInviteInput, InstitutionPatch,
  LinkExistingBranchInput, LinkExistingBranchResult, Member, MemberInviteInput,
  MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceInput, ServicePatch,
  ServiceSearchParams, ServiceSearchResult, ListingRef,} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuid() {
  return `mock-${Math.random().toString(36).slice(2, 10)}`;
}

function paginateBranches(items: Branch[], params: BranchListParams): BranchListResult {
  let filtered = items;
  if (params.filter_branch === "branches_only") filtered = filtered.filter((b) => b.linked_business_id == null);
  else if (params.filter_branch === "linked_branches") filtered = filtered.filter((b) => b.linked_business_id != null);
  if (params.search) filtered = filtered.filter((b) => b.name.toLowerCase().includes(params.search!.toLowerCase()));
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return { data: filtered.slice(start, start + limit), total: filtered.length };
}

const mockBranches: Record<number, Branch[]> = {
  1: [
    {
      id: "branch-1", name: "Prime Education Group", country: "Australia", state: "NSW", city: "Sydney",
      address: "1 George St", phone: "+61 2 9000 1000", email: "hello@primeedu.com",
      is_primary: true, linked_business_id: null, branch_type: "same_company",
      share_description: false, shared_services: [], created_at: "2026-06-01T09:00:00Z",
    },
  ],
};

const mockServices: Record<number, BusinessService[]> = {
  1: [
    {
      id: "service-1", service_category_id: 1, category_name: "Consulting", name: "University Placement",
      description: "End-to-end university application support.", price: "199.00", is_published: true,
      created_at: "2026-06-05T09:00:00Z",
    },
  ],
};

const mockMembers: Record<number, Member[]> = {
  1: [
    {
      id: 1, platform_user_id: 1, is_owner: true, account_status: 1, admin_point_of_contact: true, created_at: "2026-06-01T09:00:00Z",
      role_name: "owner", role_display_name: "Owner",
      user: { id: 1, first_name: "Alicia", last_name: "Tan", email: "alicia@primeedu.com", phone: "+61 2 9000 1000", photo_url: null },
    },
  ],
};

const mockRoles: MemberRole[] = [
  { id: 1, name: "owner", display_name: "Owner" },
  { id: 2, name: "admin", display_name: "Admin" },
  { id: 3, name: "manager", display_name: "Manager" },
  { id: 4, name: "counsellor", display_name: "Counsellor" },
  { id: 5, name: "member", display_name: "Member" },
];

function paginateRelations(items: BusinessRelation[], params: RelationListParams): RelationListResult {
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), total: items.length };
}

const mockRelations: Record<number, BusinessRelation[]> = {};
const mockActivity: Record<number, ActivityLogEntry[]> = {
  1: [
    { id: "log-1", action: "BUSINESS_UPDATED", details: { business_id: 1 }, created_at: "2026-06-02T09:00:00Z", admin_first_name: "Super", admin_last_name: "Admin" },
  ],
};

const mockBusinesses: BusinessDetail[] = [
  {
    kind: "business", id: 1, business_name: "Prime Education Group", subdomain: "primeedu", business_type: "education_agent",
    business_category_id: 1, category_name: "Education Agent", email: "hello@primeedu.com", phone: "+61 2 9000 1000",
    status: "verified", claim_status: "claimed", is_published: true, country_id: 1, country_name: "Australia", city: "Sydney",
    logo_url: null, account_status: 1, created_at: "2026-06-01T09:00:00Z",
    owner_first_name: "Alicia", owner_last_name: "Tan", owner_email: "alicia@primeedu.com",
    is_unclaimed: false, profile_views: 128, branch_count: 2, service_count: 5,
    description: "Prime Education Group helps students find the right university across Australia.",
    website: "https://primeedu.com", state: "NSW", address: "1 George St", postcode: "2000",
    cover_url: null, linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null,
    youtube_url: null, whatsapp_url: null, gallery_images: [], video_urls: [],
    verified_at: "2026-06-02T09:00:00Z", updated_at: "2026-06-02T09:00:00Z",
    enquiry_enabled: true, enquiry_coin_cost: 30, enquiry_max_distributions: 5,
  },
  {
    kind: "business", id: 2, business_name: "Everest Migration Consultants", subdomain: "everest-migration", business_type: "immigration_department",
    business_category_id: 2, category_name: "Immigration Department", email: "info@everestmigration.com", phone: null,
    status: "unverified", claim_status: "claimed", is_published: false, country_id: 2, country_name: "New Zealand", city: "Auckland",
    logo_url: null, account_status: 1, created_at: "2026-07-15T09:00:00Z",
    owner_first_name: "Ravi", owner_last_name: "Shah", owner_email: "ravi@everestmigration.com",
    is_unclaimed: false, profile_views: 12, branch_count: 0, service_count: 0,
    description: null, website: null, state: null, address: null, postcode: null,
    cover_url: null, linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null,
    youtube_url: null, whatsapp_url: null, gallery_images: [], video_urls: [],
    verified_at: null, updated_at: "2026-07-15T09:00:00Z",
    enquiry_enabled: true, enquiry_coin_cost: 30, enquiry_max_distributions: 5,
  },
  {
    kind: "business", id: 3, business_name: "Global Study Institute", subdomain: "gsi", business_type: "institution",
    business_category_id: 3, category_name: "Institution", email: "admissions@gsi.edu", phone: "+1 604 555 0110",
    status: "unverified", claim_status: "unclaimed", is_published: false, country_id: 3, country_name: "Canada", city: "Vancouver",
    logo_url: null, account_status: 1, created_at: "2026-05-20T09:00:00Z",
    owner_first_name: null, owner_last_name: null, owner_email: null,
    is_unclaimed: true, profile_views: 0, branch_count: 0, service_count: 0,
    description: null, website: null, state: null, address: null, postcode: null,
    cover_url: null, linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null,
    youtube_url: null, whatsapp_url: null, gallery_images: [], video_urls: [],
    verified_at: null, updated_at: "2026-05-20T09:00:00Z",
    enquiry_enabled: true, enquiry_coin_cost: 30, enquiry_max_distributions: 5,
  },
];

const mockInstitutions: InstitutionDetail[] = [
  {
    kind: "institution", id: 1, business_name: "Global Study Institute", subdomain: "gsi", business_type: "university",
    description: "A leading study destination institute.", website: "https://gsi.edu",
    email: "admissions@gsi.edu", phone: "+1 604 555 0110", status: "unverified", claim_status: "unclaimed",
    is_published: false, country_id: 3, country_name: "Canada", state: "British Columbia", city: "Vancouver",
    address: "100 Institute Way", postcode: "V6B 1A1", logo_url: null, cover_url: null,
    linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null, youtube_url: null, whatsapp_url: null,
    gallery_images: [], video_urls: [], account_status: 1, created_at: "2026-05-20T09:00:00Z", updated_at: "2026-05-20T09:00:00Z",
    verified_at: null, owner_id: null, is_unclaimed: true, business_category_id: null, category_name: "Institutions",
    owner_first_name: null, owner_last_name: null, owner_email: null, source_job_id: "mock-job-1",
  },
];

const mockInstitutionCourses: Record<string, InstitutionCourse[]> = {
  "mock-job-1": [
    {
      id: "course-1", name: "Bachelor of Computer Science", degree_level: "Bachelor", subject_area: "Computer Science",
      duration_weeks: 156, study_mode: "Full-time", domestic_fee_total: 28000, domestic_currency: "CAD",
      verification_status: "verified", source_url: "https://gsi.edu/courses/bcs",
    },
    {
      id: "course-2", name: "Master of Business Administration", degree_level: "Master", subject_area: "Business",
      duration_weeks: 104, study_mode: "Full-time", domestic_fee_total: 42000, domestic_currency: "CAD",
      verification_status: "unverified", source_url: null,
    },
  ],
};

const mockInstitutionInvitations: Record<number, InstitutionInvitation[]> = {
  1: [
    {
      id: "invite-1", first_name: "Jordan", last_name: "Lee", email: "jordan@gsi.edu", phone: null, role: "member",
      invited_at: "2026-08-20T09:00:00Z", expires_at: "2026-08-23T09:00:00Z",
    },
  ],
};

const mockInstitutionMembers: Record<number, Member[]> = {
  1: [
    {
      id: 1, platform_user_id: 10, is_owner: true, account_status: 1, admin_point_of_contact: false, created_at: "2026-05-20T09:00:00Z",
      role_name: "owner", role_display_name: null,
      user: { id: 10, first_name: "Priya", last_name: "Nair", email: "priya@gsi.edu", phone: null, photo_url: null },
    },
  ],
};

function applyFilters(rows: Business[], params: BusinessListParams): Business[] {
  let out = rows;
  if (params.search) {
    const q = params.search.toLowerCase();
    out = out.filter(
      (b) =>
        b.business_name.toLowerCase().includes(q) ||
        b.subdomain.toLowerCase().includes(q) ||
        (b.email ?? "").toLowerCase().includes(q),
    );
  }
  if (params.status) out = out.filter((b) => b.status === params.status);
  if (params.category) out = out.filter((b) => b.business_category_id === params.category);
  return out;
}

export const businessesMockApi = {
  getBusinesses: async (params: BusinessListParams = {}): Promise<BusinessListResult> => {
    console.log("[mock] GET /admin/platform/businesses", params);
    await delay(300);
    const rows = applyFilters(mockBusinesses, params);
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    return { data: rows.slice((page - 1) * limit, page * limit), total: rows.length };
  },
  updateStatus: async ({ kind, id }: ListingRef, status: Business["status"]): Promise<{ status: string }> => {
    console.log(`[mock] PATCH /admin/platform/${kind}s/:id/status`, id, status);
    await delay(200);
    const b = mockBusinesses.find((x) => x.kind === kind && x.id === id);
    if (b) b.status = status;
    return { status };
  },
  sendClaimRequest: async ({ kind, id }: ListingRef): Promise<{ claim_status: string }> => {
    console.log(`[mock] POST /admin/platform/${kind}s/:id/claim-request`, id);
    await delay(200);
    const b = mockBusinesses.find((x) => x.kind === kind && x.id === id);
    if (b) b.claim_status = "claim_pending";
    return { claim_status: "claim_pending" };
  },
  sendBulkClaimRequests: async (ids: number[]): Promise<{ queued: number }> => {
    console.log("[mock] POST /admin/platform/businesses/claim-requests/bulk", ids);
    await delay(300);
    for (const id of ids) {
      const b = mockBusinesses.find((x) => x.id === id);
      if (b) b.claim_status = "claim_pending";
    }
    return { queued: ids.length };
  },
  updatePublished: async ({ kind, id }: ListingRef, is_published: boolean): Promise<{ is_published: boolean }> => {
    console.log(`[mock] PATCH /admin/platform/${kind}s/:id/published`, id, is_published);
    await delay(200);
    const b = mockBusinesses.find((x) => x.kind === kind && x.id === id);
    if (b) b.is_published = is_published;
    return { is_published };
  },
  deleteBusiness: async ({ kind, id }: ListingRef): Promise<void> => {
    console.log(`[mock] DELETE /admin/platform/${kind}s/:id`, id);
    await delay(200);
    const i = mockBusinesses.findIndex((x) => x.kind === kind && x.id === id);
    if (i >= 0) mockBusinesses.splice(i, 1);
  },
  uploadImage: async (file: File): Promise<{ path: string }> => {
    console.log("[mock] POST /admin/platform/businesses/image", file.name);
    await delay(300);
    return { path: URL.createObjectURL(file) };
  },
  createBusiness: async (input: BusinessCreateInput): Promise<BusinessDetail> => {
    console.log("[mock] POST /admin/platform/businesses", input);
    await delay(300);
    const id = Math.max(0, ...mockBusinesses.map((b) => b.id)) + 1;
    const now = new Date().toISOString();
    const business: BusinessDetail = {
      kind: "business", id, business_name: input.business_name, subdomain: input.subdomain, business_type: null,
      business_category_id: input.business_category_id, category_name: null,
      email: input.email ?? null, phone: input.phone ?? null, status: "unverified", claim_status: "unclaimed", is_published: false,
      country_id: input.country_id ?? null, country_name: null, city: input.city ?? null,
      logo_url: input.logo_url ?? null, account_status: 1, created_at: now,
      owner_first_name: input.first_name ?? input.business_name, owner_last_name: input.last_name ?? null, owner_email: input.email ?? null,
      is_unclaimed: true, profile_views: 0, branch_count: 0, service_count: 0,
      description: input.description ?? null, website: input.website ?? null, state: input.state ?? null,
      address: input.address ?? null, postcode: input.postcode ?? null, cover_url: input.cover_url ?? null,
      linkedin_url: input.linkedin_url ?? null, facebook_url: input.facebook_url ?? null,
      instagram_url: input.instagram_url ?? null, twitter_url: input.twitter_url ?? null,
      youtube_url: null, whatsapp_url: null, gallery_images: [], video_urls: [],
      verified_at: null, updated_at: now, enquiry_enabled: true, enquiry_coin_cost: 30, enquiry_max_distributions: 5,
    };
    mockBusinesses.push(business);
    return business;
  },
  getBusinessDetail: async (id: number): Promise<BusinessDetail> => {
    console.log("[mock] GET /admin/platform/businesses/:id", id);
    await delay(200);
    const b = mockBusinesses.find((x) => x.id === id);
    if (!b) throw new Error("Business not found");
    return b;
  },
  getInstitutionDetail: async (id: number): Promise<InstitutionDetail> => {
    console.log("[mock] GET /admin/platform/institutions/:id", id);
    await delay(200);
    const inst = mockInstitutions.find((x) => x.id === id);
    if (!inst) throw new Error("Institution not found");
    return inst;
  },
  updateInstitution: async (id: number, patch: InstitutionPatch): Promise<InstitutionDetail> => {
    console.log("[mock] PATCH /admin/platform/institutions/:id", id, patch);
    await delay(200);
    const inst = mockInstitutions.find((x) => x.id === id);
    if (!inst) throw new Error("Institution not found");
    Object.assign(inst, patch, { updated_at: new Date().toISOString() });
    return inst;
  },
  getInstitutionMembers: async (id: number, params: MemberListParams = {}): Promise<MemberListResult> => {
    console.log("[mock] GET /admin/platform/institutions/:id/members", id);
    await delay(150);
    let items = mockInstitutionMembers[id] ?? [];
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter((m) =>
        `${m.user?.first_name ?? ""} ${m.user?.last_name ?? ""}`.toLowerCase().includes(q)
        || (m.user?.email ?? "").toLowerCase().includes(q),
      );
    }
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  getInstitutionCourses: async (id: number, params: InstitutionCourseListParams = {}): Promise<InstitutionCourseListResult> => {
    console.log("[mock] GET /admin/platform/institutions/:id/courses", id);
    await delay(150);
    const inst = mockInstitutions.find((x) => x.id === id);
    let items = inst?.source_job_id ? (mockInstitutionCourses[inst.source_job_id] ?? []) : [];
    if (params.search) items = items.filter((c) => c.name.toLowerCase().includes(params.search!.toLowerCase()));
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  inviteInstitutionMember: async (id: number, input: InstitutionInviteInput): Promise<{ id: string; email: string; status: string }> => {
    console.log("[mock] POST /admin/platform/institutions/:id/invite", id, input);
    await delay(200);
    const invitation: InstitutionInvitation = {
      id: uuid(), first_name: input.first_name, last_name: input.last_name, email: input.email,
      phone: input.phone ?? null, role: input.role,
      invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    mockInstitutionInvitations[id] = [invitation, ...(mockInstitutionInvitations[id] ?? [])];
    return { id: invitation.id, email: input.email, status: "pending" };
  },
  getInstitutionInvitations: async (id: number, params: InstitutionInvitationListParams = {}): Promise<InstitutionInvitationListResult> => {
    console.log("[mock] GET /admin/platform/institutions/:id/invitations", id);
    await delay(150);
    const items = mockInstitutionInvitations[id] ?? [];
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  cancelInstitutionInvitation: async (id: number, invitationId: string): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/institutions/:id/invitations/:invitationId", id, invitationId);
    await delay(150);
    mockInstitutionInvitations[id] = (mockInstitutionInvitations[id] ?? []).filter((i) => i.id !== invitationId);
  },
  resendInstitutionInvitation: async (id: number, invitationId: string): Promise<void> => {
    console.log("[mock] POST /admin/platform/institutions/:id/invitations/:invitationId/resend", id, invitationId);
    await delay(150);
    const invite = (mockInstitutionInvitations[id] ?? []).find((i) => i.id === invitationId);
    if (invite) invite.expires_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  },
  setInstitutionMemberStatus: async (id: number, platformUserId: number, accountStatus: number): Promise<void> => {
    console.log("[mock] PATCH /admin/platform/institutions/:id/members/:platformUserId/status", id, platformUserId, accountStatus);
    await delay(150);
    const member = (mockInstitutionMembers[id] ?? []).find((m) => m.platform_user_id === platformUserId);
    if (member) member.account_status = accountStatus;
  },
  updateBusiness: async (id: number, patch: BusinessPatch): Promise<BusinessDetail> => {
    console.log("[mock] PATCH /admin/platform/businesses/:id", id, patch);
    await delay(200);
    const b = mockBusinesses.find((x) => x.id === id);
    if (!b) throw new Error("Business not found");
    Object.assign(b, patch, { updated_at: new Date().toISOString() });
    return b;
  },
  updateEnquirySettings: async (id: number, patch: EnquirySettingsPatch): Promise<BusinessDetail> => {
    console.log("[mock] PATCH /admin/platform/businesses/:id/enquiry-settings", id, patch);
    await delay(200);
    const b = mockBusinesses.find((x) => x.id === id);
    if (!b) throw new Error("Business not found");
    Object.assign(b, patch);
    return b;
  },

  getBranches: async (id: number, params: BranchListParams = {}): Promise<BranchListResult> => {
    console.log("[mock] GET branches", id, params);
    await delay(150);
    return paginateBranches(mockBranches[id] ?? [], params);
  },
  createBranch: async (id: number, input: BranchInput): Promise<Branch> => {
    await delay(150);
    const branch: Branch = {
      id: uuid(), is_primary: false, linked_business_id: null, branch_type: "same_company", created_at: new Date().toISOString(),
      country: null, state: null, city: null, address: null, phone: null, email: null,
      share_description: false, shared_services: [], ...input,
    };
    mockBranches[id] = [...(mockBranches[id] ?? []), branch];
    return branch;
  },
  linkExistingBranch: async (id: number, input: LinkExistingBranchInput): Promise<LinkExistingBranchResult> => {
    console.log("[mock] POST branches/link-existing", id, input);
    await delay(200);
    const partner = mockBusinesses.find((x) => x.id === input.business_id);
    if (!partner) throw new Error("Business not found");
    const branch: Branch = {
      id: uuid(), name: partner.business_name, country: partner.country_name, state: partner.state,
      city: partner.city, address: partner.address, phone: partner.phone, email: partner.email,
      is_primary: false, linked_business_id: partner.id, branch_type: input.branch_type,
      share_description: false, shared_services: input.shared_services, created_at: new Date().toISOString(),
    };
    mockBranches[id] = [...(mockBranches[id] ?? []), branch];
    return { branch };
  },
  updateBranch: async (id: number, branchId: string, patch: BranchPatch): Promise<Branch> => {
    await delay(150);
    const branch = (mockBranches[id] ?? []).find((b) => b.id === branchId);
    if (!branch) throw new Error("Branch not found");
    Object.assign(branch, patch);
    return branch;
  },
  deleteBranch: async (id: number, branchId: string): Promise<void> => {
    await delay(150);
    mockBranches[id] = (mockBranches[id] ?? []).filter((b) => b.id !== branchId);
  },

  getServices: async (id: number): Promise<BusinessService[]> => {
    await delay(150);
    return mockServices[id] ?? [];
  },
  searchServices: async (id: number, params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    await delay(150);
    let items = mockServices[id] ?? [];
    if (params.search) items = items.filter((s) => s.name.toLowerCase().includes(params.search!.toLowerCase()));
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  createService: async (id: number, input: ServiceInput): Promise<BusinessService> => {
    await delay(200);
    const service: BusinessService = {
      id: uuid(), category_name: null, is_published: false, created_at: new Date().toISOString(),
      name: input.name, service_category_id: input.service_category_id,
      description: input.description ?? null, price: input.price != null ? String(input.price) : null,
    };
    mockServices[id] = [...(mockServices[id] ?? []), service];
    return service;
  },
  updateService: async (id: number, serviceId: string, patch: ServicePatch): Promise<BusinessService> => {
    await delay(200);
    const s = (mockServices[id] ?? []).find((x) => x.id === serviceId);
    if (!s) throw new Error("Service not found");
    Object.assign(s, patch, { price: patch.price != null ? String(patch.price) : s.price });
    return s;
  },
  setServicePublished: async (id: number, serviceId: string, is_published: boolean): Promise<BusinessService> => {
    await delay(150);
    const s = (mockServices[id] ?? []).find((x) => x.id === serviceId);
    if (!s) throw new Error("Service not found");
    s.is_published = is_published;
    return s;
  },
  deleteService: async (id: number, serviceId: string): Promise<void> => {
    await delay(150);
    mockServices[id] = (mockServices[id] ?? []).filter((s) => s.id !== serviceId);
  },
  getServiceFieldValues: async (): Promise<SchemaFieldValue[]> => {
    await delay(100);
    return [];
  },
  updateServiceFieldValues: async (_id: number, _serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> => {
    await delay(150);
    return values;
  },

  getMembers: async (id: number, params: MemberListParams = {}): Promise<MemberListResult> => {
    await delay(150);
    let items = mockMembers[id] ?? [];
    if (params.point_of_contact) items = items.filter((m) => m.admin_point_of_contact);
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter((m) =>
        `${m.user?.first_name ?? ""} ${m.user?.last_name ?? ""}`.toLowerCase().includes(q)
        || (m.user?.email ?? "").toLowerCase().includes(q),
      );
    }
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  getMemberRoles: async (): Promise<MemberRole[]> => {
    await delay(100);
    return mockRoles;
  },
  // ponytail: mock skips the invite/accept round-trip and adds the member immediately.
  inviteMember: async (id: number, input: MemberInviteInput): Promise<{ id: string; email: string; status: string }> => {
    await delay(150);
    const role = mockRoles.find((r) => r.name === input.role) ?? mockRoles[mockRoles.length - 1]!;
    const existing = mockMembers[id] ?? [];
    const nextId = existing.reduce((max, m) => Math.max(max, m.id), 0) + 1;
    const member: Member = {
      id: nextId, platform_user_id: nextId, is_owner: false, account_status: 1,
      admin_point_of_contact: input.admin_point_of_contact ?? false, created_at: new Date().toISOString(),
      role_name: role.name, role_display_name: role.display_name,
      user: { id: nextId, first_name: input.first_name, last_name: input.last_name, email: input.email, phone: input.phone ?? null, photo_url: null },
    };
    mockMembers[id] = [...existing, member];
    return { id: uuid(), email: input.email, status: "pending" };
  },
  updateMember: async (id: number, memberId: number, patch: MemberPatch): Promise<Member> => {
    await delay(150);
    const m = (mockMembers[id] ?? []).find((x) => x.id === memberId);
    if (!m) throw new Error("Member not found");
    if (patch.is_owner === true && !m.is_owner) {
      const existingOwner = (mockMembers[id] ?? []).find((x) => x.is_owner);
      if (existingOwner && existingOwner.id !== memberId) throw new Error("This business already has an owner");
    }
    if (patch.role) {
      const role = mockRoles.find((r) => r.name === patch.role);
      if (role) { m.role_name = role.name; m.role_display_name = role.display_name; }
    }
    if (patch.admin_point_of_contact !== undefined) m.admin_point_of_contact = patch.admin_point_of_contact;
    if (patch.account_status !== undefined) m.account_status = patch.account_status;
    if (patch.is_owner !== undefined) m.is_owner = patch.is_owner;
    return m;
  },
  removeMember: async (id: number, memberId: number): Promise<void> => {
    await delay(150);
    mockMembers[id] = (mockMembers[id] ?? []).filter((m) => m.id !== memberId);
  },

  getRelations: async (id: number, params: RelationListParams = {}): Promise<RelationListResult> => {
    await delay(150);
    return paginateRelations(mockRelations[id] ?? [], params);
  },
  createRelation: async (id: number, input: RelationInput): Promise<BusinessRelation> => {
    await delay(150);
    const makeRelation = (targetId: number): BusinessRelation => {
      const biz = mockBusinesses.find((x) => x.id === input.partner_business_id);
      if (!biz) throw new Error("Business not found");
      const relation: BusinessRelation = {
        id: uuid(), status: "active", relation_type: input.relation_type, created_at: new Date().toISOString(),
        business_id: biz.id, business_name: biz.business_name, logo_url: biz.logo_url, business_type: biz.business_type,
        country_ids: input.country_ids ?? [], valid_from: input.valid_from ?? null,
        valid_until: input.valid_until ?? null, notes: input.notes ?? null,
      };
      mockRelations[targetId] = [...(mockRelations[targetId] ?? []), relation];
      return relation;
    };
    const relation = makeRelation(id);
    if (input.apply_to_branches) {
      const branchBusinessIds = (mockBranches[id] ?? [])
        .map((b) => b.linked_business_id)
        .filter((bid): bid is number => bid != null && bid !== input.partner_business_id);
      for (const branchId of branchBusinessIds) makeRelation(branchId);
    }
    return relation;
  },
  updateRelation: async (id: number, relationId: string, patch: RelationPatch): Promise<BusinessRelation> => {
    await delay(150);
    const relation = (mockRelations[id] ?? []).find((r) => r.id === relationId);
    if (!relation) throw new Error("Relation not found");
    Object.assign(relation, patch);
    return relation;
  },
  deleteRelation: async (id: number, relationId: string): Promise<void> => {
    await delay(150);
    mockRelations[id] = (mockRelations[id] ?? []).filter((r) => r.id !== relationId);
  },

  getActivity: async (id: number, params: ActivityListParams = {}): Promise<ActivityListResult> => {
    await delay(150);
    const items = mockActivity[id] ?? [];
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
};
