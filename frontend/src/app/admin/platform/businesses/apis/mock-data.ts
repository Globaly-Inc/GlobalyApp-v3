import type {
  ActivityListParams, ActivityListResult, ActivityLogEntry, Branch, BranchInput, BranchListParams, BranchListResult,
  BranchPatch, Business, BusinessCreateInput, BusinessDetail, BusinessListParams, BusinessListResult, BusinessPatch, BusinessRelation,
  BusinessService, Contact, ContactInput, ContactListParams, ContactListResult, ContactPatch,
  EnquirySettingsPatch, InstitutionBranch, InstitutionBranchListParams, InstitutionBranchListResult, InstitutionCourse, InstitutionCourseListParams, InstitutionCourseListResult, InstitutionDetail,
  ListingKind,
  InstitutionInvitation, InstitutionInvitationListParams, InstitutionInvitationListResult, InstitutionInviteInput,
  InstitutionPartner, InstitutionPartnerInput, InstitutionPartnerListParams, InstitutionPartnerListResult, InstitutionPartnerPatch, InstitutionPartnerRow, InstitutionPatch,
  InstitutionPermission, InstitutionRole, InstitutionRoleCreateInput, InstitutionRolePatch,
  LinkExistingBranchInput, LinkExistingBranchResult, Member, MemberInviteInput,
  MemberListParams, MemberListResult, MemberPatch, MemberRole,
  RelationInput, RelationListParams, RelationListResult, RelationPatch, SchemaFieldValue, ServiceAccreditation, ServiceAccreditationInput,
  ServiceAiAssistInput, ServiceAiAssistResult, ServiceEligibility, ServiceEligibilityInput, ServiceEligibilityPatch,
  ServiceFee, ServiceFeeInput, ServiceFeePatch, ServiceInput, ServiceIntake, ServiceIntakeInput, ServiceIntakePatch, ServiceMediaFile, ServicePatch,
  ServiceSearchParams, ServiceSearchResult, ServiceStudyOption, ServiceStudyOptionInput, ServiceStudyOptionPatch,
  ServiceStudyUnit, ServiceStudyUnitInput, ServiceStudyUnitPatch, ListingRef,} from "./types";
import { toSlug } from "../utils";

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

// Separate from mockServices: institution ids collide with business ids, so a shared map would
// leak one kind's mock services into the other.
const mockInstitutionServices: Record<number, BusinessService[]> = {};

// Same collision reasoning as mockInstitutionServices — separate maps per kind.
const mockContacts: Record<number, Contact[]> = {};
const mockInstitutionContacts: Record<number, Contact[]> = {};

async function contactListMock(store: Record<number, Contact[]>, id: number, params: ContactListParams): Promise<ContactListResult> {
  await delay(150);
  let items = store[id] ?? [];
  if (params.search) items = items.filter((c) => c.full_name.toLowerCase().includes(params.search!.toLowerCase()));
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), total: items.length };
}

async function createContactMock(store: Record<number, Contact[]>, id: number, input: ContactInput): Promise<Contact> {
  await delay(200);
  const now = new Date().toISOString();
  const contact: Contact = {
    id: uuid(),
    full_name: input.full_name,
    job_title: input.job_title ?? null,
    department: input.department ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    phone_country_code: input.phone_country_code ?? null,
    linkedin_url: input.linkedin_url ?? null,
    other_url: input.other_url ?? null,
    tags: input.tags ?? [],
    preferred_channel: input.preferred_channel ?? null,
    is_primary: input.is_primary ?? false,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  if (contact.is_primary) for (const c of store[id] ?? []) c.is_primary = false;
  store[id] = [...(store[id] ?? []), contact];
  return contact;
}

async function updateContactMock(store: Record<number, Contact[]>, id: number, contactId: string, patch: ContactPatch): Promise<Contact> {
  await delay(200);
  const c = (store[id] ?? []).find((x) => x.id === contactId);
  if (!c) throw new Error("Contact not found");
  if (patch.is_primary) for (const other of store[id] ?? []) if (other.id !== contactId) other.is_primary = false;
  Object.assign(c, patch, { updated_at: new Date().toISOString() });
  return c;
}

async function deleteContactMock(store: Record<number, Contact[]>, id: number, contactId: string): Promise<void> {
  await delay(150);
  store[id] = (store[id] ?? []).filter((c) => c.id !== contactId);
}

let mockFeeId = 1;
const mockServiceFees: Record<string, ServiceFee[]> = {};
function mockFeeRecord(serviceId: string, input: ServiceFeeInput): ServiceFee {
  return {
    id: mockFeeId++, service_id: serviceId, name: input.name ?? null,
    student_type: input.student_type ?? "both", period_type: input.period_type ?? "Per Year",
    currency: input.currency ?? "AUD", total_amount: String(input.total_amount),
    installments: input.installments ?? [], created_at: new Date().toISOString(),
  };
}

let mockIntakeId = 1;
const mockServiceIntakes: Record<string, ServiceIntake[]> = {};
function mockIntakeRecord(serviceId: string, input: ServiceIntakeInput): ServiceIntake {
  return {
    id: mockIntakeId++, service_id: serviceId, intake_name: input.intake_name ?? null,
    start_date: input.start_date ?? null, end_date: input.end_date ?? null,
    orientation_date: input.orientation_date ?? null, admission_deadline: input.admission_deadline ?? null,
    intake_month: input.intake_month ?? null, intake_year: input.intake_year ?? null,
    created_at: new Date().toISOString(),
  };
}

let mockEligibilityId = 1;
const mockServiceEligibility: Record<string, ServiceEligibility[]> = {};
function mockEligibilityRecord(serviceId: string, input: ServiceEligibilityInput): ServiceEligibility {
  return {
    id: mockEligibilityId++, service_id: serviceId, name: input.name ?? null,
    applicable_to: input.applicable_to ?? "both", degree_level_id: input.degree_level_id ?? null,
    score_type: input.score_type ?? null, min_score: input.min_score != null ? String(input.min_score) : null,
    description: input.description ?? null, academic_tests: input.academic_tests ?? [], language_tests: input.language_tests ?? [],
    created_at: new Date().toISOString(),
  };
}

let mockStudyOptionId = 1;
const mockServiceStudyOptions: Record<string, ServiceStudyOption[]> = {};
function mockStudyOptionRecord(serviceId: string, input: ServiceStudyOptionInput): ServiceStudyOption {
  return {
    id: mockStudyOptionId++, service_id: serviceId, name: input.name ?? null,
    study_mode: input.study_mode ?? "on_campus", study_load: input.study_load ?? "full_time",
    duration_value: input.duration_value ?? null, duration_unit: input.duration_unit ?? "months",
    applicable_to: input.applicable_to ?? "both", created_at: new Date().toISOString(),
  };
}

let mockStudyUnitId = 1;
const mockServiceStudyUnits: Record<string, ServiceStudyUnit[]> = {};
function mockStudyUnitRecord(serviceId: string, input: ServiceStudyUnitInput): ServiceStudyUnit {
  return {
    id: mockStudyUnitId++, service_id: serviceId, unit_code: input.unit_code ?? null,
    unit_name: input.unit_name, credit_points: input.credit_points ?? null,
    description: input.description ?? null, unit_type: input.unit_type ?? "compulsory",
    created_at: new Date().toISOString(),
  };
}

let mockAccreditationRowId = 1;
const mockServiceAccreditations: Record<string, ServiceAccreditation[]> = {};
function mockAccreditationRecord(serviceId: string, input: ServiceAccreditationInput): ServiceAccreditation {
  return { id: mockAccreditationRowId++, service_id: serviceId, accreditation_id: input.accreditation_id, created_at: new Date().toISOString() };
}

let mockMediaFileId = 1;
const mockServiceMedia: Record<string, ServiceMediaFile[]> = {};

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
  const filtered = params.search
    ? items.filter((r) => r.partner_name.toLowerCase().includes(params.search!.toLowerCase()))
    : items;
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return { data: filtered.slice(start, start + limit), total: filtered.length };
}

const mockRelations: Record<number, BusinessRelation[]> = {};
const mockInstitutionRelations: Record<number, BusinessRelation[]> = {};
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
    is_unclaimed: false, profile_views: 128, source_job_id: null, origin: "signup", branch_count: 2, service_count: 5,
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
    is_unclaimed: false, profile_views: 12, source_job_id: null, origin: "signup", branch_count: 0, service_count: 0,
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
    is_unclaimed: true, profile_views: 0, source_job_id: null, origin: "admin", branch_count: 0, service_count: 0,
    description: null, website: null, state: null, address: null, postcode: null,
    cover_url: null, linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null,
    youtube_url: null, whatsapp_url: null, gallery_images: [], video_urls: [],
    verified_at: null, updated_at: "2026-05-20T09:00:00Z",
    enquiry_enabled: true, enquiry_coin_cost: 30, enquiry_max_distributions: 5,
  },
];

const mockInstitutions: InstitutionDetail[] = [
  {
    kind: "institution", id: 1, slug: "global-study-institute-000001", business_name: "Global Study Institute", subdomain: "gsi", business_type: "university",
    description: "A leading study destination institute.", website: "https://gsi.edu",
    email: "admissions@gsi.edu", phone: "+1 604 555 0110", status: "unverified", claim_status: "unclaimed",
    is_published: false, country_id: 3, country_name: "Canada", state: "British Columbia", city: "Vancouver",
    address: "100 Institute Way", postcode: "V6B 1A1", logo_url: null, cover_url: null,
    linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null, youtube_url: null, whatsapp_url: null,
    gallery_images: [], video_urls: [], account_status: 1, created_at: "2026-05-20T09:00:00Z", updated_at: "2026-05-20T09:00:00Z",
    verified_at: null, owner_id: null, is_unclaimed: true, business_category_id: null, category_name: "Institutions",
    owner_first_name: null, owner_last_name: null, owner_email: null, source_job_id: "mock-job-1", origin: "seeded",
    branch_count: 0, service_count: 3,
  },
];

const mockInstitutionCourses: Record<string, InstitutionCourse[]> = {
  "mock-job-1": [
    {
      id: "course-1", slug: "bachelor-of-computer-science-course1", name: "Bachelor of Computer Science", degree_level: "Bachelor", subject_area: "Computer Science",
      duration_weeks: 156, study_mode: "Full-time", domestic_fee_total: 28000, domestic_currency: "CAD",
      verification_status: "verified", source_url: "https://gsi.edu/courses/bcs",
    },
    {
      id: "course-2", slug: "master-of-business-administration-course2", name: "Master of Business Administration", degree_level: "Master", subject_area: "Business",
      duration_weeks: 104, study_mode: "Full-time", domestic_fee_total: 42000, domestic_currency: "CAD",
      verification_status: "unverified", source_url: null,
    },
  ],
};

const mockInstitutionBranches: Record<string, InstitutionBranch[]> = {
  "mock-job-1": [
    {
      id: "campus-1", name: "Main Campus", address: "100 Institute Way", city: "Vancouver", state: "British Columbia",
      country: "Canada", phone: "+1 604 555 0110", email: "admissions@gsi.edu", source_url: "https://gsi.edu/campuses",
    },
  ],
};

const mockInstitutionPartners: Record<string, InstitutionPartner[]> = {
  "mock-job-1": [
    {
      id: "agent-1", name: "Global Study Consultants", country: "India", email: "info@gsc.example",
      phone: "+91 22 5550 1234", website: "https://gsc.example", source_url: "https://gsi.edu/agents",
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
  if (params.kind) out = out.filter((b) => b.kind === params.kind);
  if (params.business_type) out = out.filter((b) => b.business_type === params.business_type);
  if (params.origin) out = out.filter((b) => b.origin === params.origin);
  if (params.ownership === "owned") out = out.filter((b) => !b.is_unclaimed);
  if (params.ownership === "unclaimed") out = out.filter((b) => b.is_unclaimed);
  out = [...out].sort((a, b) => {
    switch (params.sort) {
      case "name_desc": return b.business_name.localeCompare(a.business_name);
      case "created_desc": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "created_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default: return a.business_name.localeCompare(b.business_name);
    }
  });
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
      kind: "business", id, business_name: input.business_name, subdomain: toSlug(input.business_name), business_type: null,
      business_category_id: input.business_category_id, category_name: null,
      email: input.email ?? null, phone: input.phone ?? null, status: "unverified", claim_status: "unclaimed", is_published: false,
      country_id: input.country_id ?? null, country_name: null, city: input.city ?? null,
      logo_url: input.logo_url ?? null, account_status: 1, created_at: now,
      owner_first_name: input.first_name ?? input.business_name, owner_last_name: input.last_name ?? null, owner_email: input.email ?? null,
      is_unclaimed: true, profile_views: 0, source_job_id: null, origin: "admin", branch_count: 0, service_count: 0,
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
  mintInstitutionPreviewToken: async (id: number): Promise<{ preview_token: string }> => {
    console.log("[mock] POST /admin/platform/institutions/:id/preview-token", id);
    await delay(100);
    return { preview_token: "mock-preview-token" };
  },
  getListingKind: async (id: number): Promise<{ kind: ListingKind }> => {
    console.log("[mock] GET /admin/platform/listings/:id/kind", id);
    await delay(100);
    if (mockInstitutions.some((x) => x.id === id)) return { kind: "institution" };
    if (mockBusinesses.some((x) => x.id === id)) return { kind: "business" };
    throw new Error("Listing not found");
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
  getInstitutionBranches: async (id: number, params: InstitutionBranchListParams = {}): Promise<InstitutionBranchListResult> => {
    console.log("[mock] GET /admin/platform/institutions/:id/branches", id);
    await delay(150);
    const inst = mockInstitutions.find((x) => x.id === id);
    let items = inst?.source_job_id ? (mockInstitutionBranches[inst.source_job_id] ?? []) : [];
    if (params.search) items = items.filter((b) => b.name?.toLowerCase().includes(params.search!.toLowerCase()));
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  getInstitutionPartners: async (id: number, params: InstitutionPartnerListParams = {}): Promise<InstitutionPartnerListResult> => {
    console.log("[mock] GET /admin/platform/institutions/:id/partners", id, params);
    await delay(150);
    const inst = mockInstitutions.find((x) => x.id === id);
    const extracted = inst?.source_job_id ? (mockInstitutionPartners[inst.source_job_id] ?? []) : [];
    let rows: InstitutionPartnerRow[] = [
      ...(mockInstitutionRelations[id] ?? []).map((r): InstitutionPartnerRow => ({ ...r, source: "manual" })),
      ...extracted.map((a): InstitutionPartnerRow => ({ ...a, source: "extracted" })),
    ];
    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter((r) => (r.source === "manual" ? r.partner_name : (r.name ?? "")).toLowerCase().includes(q));
    }
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), total: rows.length };
  },
  createInstitutionPartner: async (id: number, input: InstitutionPartnerInput): Promise<BusinessRelation> => {
    console.log("[mock] POST /admin/platform/institutions/:id/partners", id, input);
    await delay(150);
    const biz = mockBusinesses.find((x) => x.id === input.business_id);
    if (!biz) throw new Error("Business not found");
    const relation: BusinessRelation = {
      id: uuid(), status: "active", created_at: new Date().toISOString(),
      partner_kind: "business", partner_id: biz.id, partner_name: biz.business_name, partner_logo_url: biz.logo_url, business_type: biz.business_type,
      country_ids: input.country_ids ?? [], valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null, notes: input.notes ?? null,
    };
    mockInstitutionRelations[id] = [...(mockInstitutionRelations[id] ?? []), relation];
    return relation;
  },
  updateInstitutionPartner: async (id: number, partnerId: string, patch: InstitutionPartnerPatch): Promise<BusinessRelation> => {
    console.log("[mock] PATCH /admin/platform/institutions/:id/partners/:partnerId", id, partnerId, patch);
    await delay(150);
    const relation = (mockInstitutionRelations[id] ?? []).find((r) => r.id === partnerId);
    if (!relation) throw new Error("Partner not found");
    Object.assign(relation, patch);
    return relation;
  },
  deleteInstitutionPartner: async (id: number, partnerId: string): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/institutions/:id/partners/:partnerId", id, partnerId);
    await delay(150);
    mockInstitutionRelations[id] = (mockInstitutionRelations[id] ?? []).filter((r) => r.id !== partnerId);
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
  getServiceFees: async (_id: number, serviceId: string): Promise<ServiceFee[]> => {
    await delay(100);
    return mockServiceFees[serviceId] ?? [];
  },
  createServiceFee: async (_id: number, serviceId: string, input: ServiceFeeInput): Promise<ServiceFee> => {
    await delay(150);
    const fee = mockFeeRecord(serviceId, input);
    mockServiceFees[serviceId] = [...(mockServiceFees[serviceId] ?? []), fee];
    return fee;
  },
  updateServiceFee: async (_id: number, serviceId: string, feeId: number, patch: ServiceFeePatch): Promise<ServiceFee> => {
    await delay(150);
    const fee = (mockServiceFees[serviceId] ?? []).find((f) => f.id === feeId);
    if (!fee) throw new Error("Fee not found");
    Object.assign(fee, patch, { total_amount: patch.total_amount != null ? String(patch.total_amount) : fee.total_amount });
    return fee;
  },
  deleteServiceFee: async (_id: number, serviceId: string, feeId: number): Promise<void> => {
    await delay(150);
    mockServiceFees[serviceId] = (mockServiceFees[serviceId] ?? []).filter((f) => f.id !== feeId);
  },

  getServiceIntakes: async (_id: number, serviceId: string): Promise<ServiceIntake[]> => {
    await delay(100);
    return mockServiceIntakes[serviceId] ?? [];
  },
  createServiceIntake: async (_id: number, serviceId: string, input: ServiceIntakeInput): Promise<ServiceIntake> => {
    await delay(150);
    const intake = mockIntakeRecord(serviceId, input);
    mockServiceIntakes[serviceId] = [...(mockServiceIntakes[serviceId] ?? []), intake];
    return intake;
  },
  updateServiceIntake: async (_id: number, serviceId: string, intakeId: number, patch: ServiceIntakePatch): Promise<ServiceIntake> => {
    await delay(150);
    const intake = (mockServiceIntakes[serviceId] ?? []).find((i) => i.id === intakeId);
    if (!intake) throw new Error("Intake not found");
    Object.assign(intake, patch);
    return intake;
  },
  deleteServiceIntake: async (_id: number, serviceId: string, intakeId: number): Promise<void> => {
    await delay(150);
    mockServiceIntakes[serviceId] = (mockServiceIntakes[serviceId] ?? []).filter((i) => i.id !== intakeId);
  },

  getServiceEligibility: async (_id: number, serviceId: string): Promise<ServiceEligibility[]> => {
    await delay(100);
    return mockServiceEligibility[serviceId] ?? [];
  },
  createServiceEligibility: async (_id: number, serviceId: string, input: ServiceEligibilityInput): Promise<ServiceEligibility> => {
    await delay(150);
    const row = mockEligibilityRecord(serviceId, input);
    mockServiceEligibility[serviceId] = [...(mockServiceEligibility[serviceId] ?? []), row];
    return row;
  },
  updateServiceEligibility: async (_id: number, serviceId: string, eligibilityId: number, patch: ServiceEligibilityPatch): Promise<ServiceEligibility> => {
    await delay(150);
    const row = (mockServiceEligibility[serviceId] ?? []).find((r) => r.id === eligibilityId);
    if (!row) throw new Error("Eligibility requirement not found");
    Object.assign(row, patch, { min_score: patch.min_score != null ? String(patch.min_score) : row.min_score });
    return row;
  },
  deleteServiceEligibility: async (_id: number, serviceId: string, eligibilityId: number): Promise<void> => {
    await delay(150);
    mockServiceEligibility[serviceId] = (mockServiceEligibility[serviceId] ?? []).filter((r) => r.id !== eligibilityId);
  },

  getServiceStudyOptions: async (_id: number, serviceId: string): Promise<ServiceStudyOption[]> => {
    await delay(100);
    return mockServiceStudyOptions[serviceId] ?? [];
  },
  createServiceStudyOption: async (_id: number, serviceId: string, input: ServiceStudyOptionInput): Promise<ServiceStudyOption> => {
    await delay(150);
    const row = mockStudyOptionRecord(serviceId, input);
    mockServiceStudyOptions[serviceId] = [...(mockServiceStudyOptions[serviceId] ?? []), row];
    return row;
  },
  updateServiceStudyOption: async (_id: number, serviceId: string, optionId: number, patch: ServiceStudyOptionPatch): Promise<ServiceStudyOption> => {
    await delay(150);
    const row = (mockServiceStudyOptions[serviceId] ?? []).find((r) => r.id === optionId);
    if (!row) throw new Error("Study option not found");
    Object.assign(row, patch);
    return row;
  },
  deleteServiceStudyOption: async (_id: number, serviceId: string, optionId: number): Promise<void> => {
    await delay(150);
    mockServiceStudyOptions[serviceId] = (mockServiceStudyOptions[serviceId] ?? []).filter((r) => r.id !== optionId);
  },

  getServiceStudyUnits: async (_id: number, serviceId: string): Promise<ServiceStudyUnit[]> => {
    await delay(100);
    return mockServiceStudyUnits[serviceId] ?? [];
  },
  createServiceStudyUnit: async (_id: number, serviceId: string, input: ServiceStudyUnitInput): Promise<ServiceStudyUnit> => {
    await delay(150);
    const row = mockStudyUnitRecord(serviceId, input);
    mockServiceStudyUnits[serviceId] = [...(mockServiceStudyUnits[serviceId] ?? []), row];
    return row;
  },
  updateServiceStudyUnit: async (_id: number, serviceId: string, unitId: number, patch: ServiceStudyUnitPatch): Promise<ServiceStudyUnit> => {
    await delay(150);
    const row = (mockServiceStudyUnits[serviceId] ?? []).find((r) => r.id === unitId);
    if (!row) throw new Error("Study unit not found");
    Object.assign(row, patch);
    return row;
  },
  deleteServiceStudyUnit: async (_id: number, serviceId: string, unitId: number): Promise<void> => {
    await delay(150);
    mockServiceStudyUnits[serviceId] = (mockServiceStudyUnits[serviceId] ?? []).filter((r) => r.id !== unitId);
  },

  getServiceAccreditations: async (_id: number, serviceId: string): Promise<ServiceAccreditation[]> => {
    await delay(100);
    return mockServiceAccreditations[serviceId] ?? [];
  },
  createServiceAccreditation: async (_id: number, serviceId: string, input: ServiceAccreditationInput): Promise<ServiceAccreditation> => {
    await delay(150);
    const row = mockAccreditationRecord(serviceId, input);
    mockServiceAccreditations[serviceId] = [...(mockServiceAccreditations[serviceId] ?? []), row];
    return row;
  },
  deleteServiceAccreditation: async (_id: number, serviceId: string, rowId: number): Promise<void> => {
    await delay(150);
    mockServiceAccreditations[serviceId] = (mockServiceAccreditations[serviceId] ?? []).filter((r) => r.id !== rowId);
  },

  getServiceMedia: async (_id: number, serviceId: string): Promise<{ files: ServiceMediaFile[] }> => {
    await delay(100);
    return { files: mockServiceMedia[serviceId] ?? [] };
  },
  uploadServiceMedia: async (_id: number, serviceId: string, file: File): Promise<ServiceMediaFile> => {
    await delay(300);
    const row: ServiceMediaFile = { id: mockMediaFileId++, original_name: file.name, mime_type: file.type, size_bytes: file.size, url: URL.createObjectURL(file) };
    mockServiceMedia[serviceId] = [...(mockServiceMedia[serviceId] ?? []), row];
    return row;
  },
  deleteServiceMedia: async (_id: number, serviceId: string, fileId: number): Promise<void> => {
    await delay(150);
    mockServiceMedia[serviceId] = (mockServiceMedia[serviceId] ?? []).filter((f) => f.id !== fileId);
  },

  generateServiceDescription: async (input: ServiceAiAssistInput): Promise<ServiceAiAssistResult> => {
    await delay(600);
    return {
      text: `${input.name} is a ${input.category_name?.toLowerCase() ?? "program"} designed to give students practical, industry-relevant skills and a clear pathway toward their career goals.`,
    };
  },

  getContacts: async (id: number, params: ContactListParams = {}): Promise<ContactListResult> => contactListMock(mockContacts, id, params),
  createContact: async (id: number, input: ContactInput): Promise<Contact> => createContactMock(mockContacts, id, input),
  updateContact: async (id: number, contactId: string, patch: ContactPatch): Promise<Contact> => updateContactMock(mockContacts, id, contactId, patch),
  deleteContact: async (id: number, contactId: string): Promise<void> => deleteContactMock(mockContacts, id, contactId),

  getInstitutionContacts: async (id: number, params: ContactListParams = {}): Promise<ContactListResult> => contactListMock(mockInstitutionContacts, id, params),
  createInstitutionContact: async (id: number, input: ContactInput): Promise<Contact> => createContactMock(mockInstitutionContacts, id, input),
  updateInstitutionContact: async (id: number, contactId: string, patch: ContactPatch): Promise<Contact> =>
    updateContactMock(mockInstitutionContacts, id, contactId, patch),
  deleteInstitutionContact: async (id: number, contactId: string): Promise<void> => deleteContactMock(mockInstitutionContacts, id, contactId),

  getInstitutionServices: async (id: number): Promise<BusinessService[]> => {
    await delay(150);
    return mockInstitutionServices[id] ?? [];
  },
  searchInstitutionServices: async (id: number, params: ServiceSearchParams = {}): Promise<ServiceSearchResult> => {
    await delay(150);
    let items = mockInstitutionServices[id] ?? [];
    if (params.search) items = items.filter((s) => s.name.toLowerCase().includes(params.search!.toLowerCase()));
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total: items.length };
  },
  createInstitutionService: async (id: number, input: ServiceInput): Promise<BusinessService> => {
    await delay(200);
    const service: BusinessService = {
      id: uuid(), category_name: null, is_published: false, created_at: new Date().toISOString(),
      name: input.name, service_category_id: input.service_category_id,
      description: input.description ?? null, price: input.price != null ? String(input.price) : null,
    };
    mockInstitutionServices[id] = [...(mockInstitutionServices[id] ?? []), service];
    return service;
  },
  updateInstitutionService: async (id: number, serviceId: string, patch: ServicePatch): Promise<BusinessService> => {
    await delay(200);
    const s = (mockInstitutionServices[id] ?? []).find((x) => x.id === serviceId);
    if (!s) throw new Error("Service not found");
    Object.assign(s, patch, { price: patch.price != null ? String(patch.price) : s.price });
    return s;
  },
  setInstitutionServicePublished: async (id: number, serviceId: string, is_published: boolean): Promise<BusinessService> => {
    await delay(150);
    const s = (mockInstitutionServices[id] ?? []).find((x) => x.id === serviceId);
    if (!s) throw new Error("Service not found");
    s.is_published = is_published;
    return s;
  },
  deleteInstitutionService: async (id: number, serviceId: string): Promise<void> => {
    await delay(150);
    mockInstitutionServices[id] = (mockInstitutionServices[id] ?? []).filter((s) => s.id !== serviceId);
  },
  getInstitutionServiceFieldValues: async (): Promise<SchemaFieldValue[]> => {
    await delay(100);
    return [];
  },
  updateInstitutionServiceFieldValues: async (_id: number, _serviceId: string, values: SchemaFieldValue[]): Promise<SchemaFieldValue[]> => {
    await delay(150);
    return values;
  },
  getInstitutionServiceFees: async (_id: number, serviceId: string): Promise<ServiceFee[]> => {
    await delay(100);
    return mockServiceFees[serviceId] ?? [];
  },
  createInstitutionServiceFee: async (_id: number, serviceId: string, input: ServiceFeeInput): Promise<ServiceFee> => {
    await delay(150);
    const fee = mockFeeRecord(serviceId, input);
    mockServiceFees[serviceId] = [...(mockServiceFees[serviceId] ?? []), fee];
    return fee;
  },
  updateInstitutionServiceFee: async (_id: number, serviceId: string, feeId: number, patch: ServiceFeePatch): Promise<ServiceFee> => {
    await delay(150);
    const fee = (mockServiceFees[serviceId] ?? []).find((f) => f.id === feeId);
    if (!fee) throw new Error("Fee not found");
    Object.assign(fee, patch, { total_amount: patch.total_amount != null ? String(patch.total_amount) : fee.total_amount });
    return fee;
  },
  deleteInstitutionServiceFee: async (_id: number, serviceId: string, feeId: number): Promise<void> => {
    await delay(150);
    mockServiceFees[serviceId] = (mockServiceFees[serviceId] ?? []).filter((f) => f.id !== feeId);
  },
  getInstitutionServiceIntakes: async (_id: number, serviceId: string): Promise<ServiceIntake[]> => {
    await delay(100);
    return mockServiceIntakes[serviceId] ?? [];
  },
  createInstitutionServiceIntake: async (_id: number, serviceId: string, input: ServiceIntakeInput): Promise<ServiceIntake> => {
    await delay(150);
    const intake = mockIntakeRecord(serviceId, input);
    mockServiceIntakes[serviceId] = [...(mockServiceIntakes[serviceId] ?? []), intake];
    return intake;
  },
  updateInstitutionServiceIntake: async (_id: number, serviceId: string, intakeId: number, patch: ServiceIntakePatch): Promise<ServiceIntake> => {
    await delay(150);
    const intake = (mockServiceIntakes[serviceId] ?? []).find((i) => i.id === intakeId);
    if (!intake) throw new Error("Intake not found");
    Object.assign(intake, patch);
    return intake;
  },
  deleteInstitutionServiceIntake: async (_id: number, serviceId: string, intakeId: number): Promise<void> => {
    await delay(150);
    mockServiceIntakes[serviceId] = (mockServiceIntakes[serviceId] ?? []).filter((i) => i.id !== intakeId);
  },

  getInstitutionServiceEligibility: async (_id: number, serviceId: string): Promise<ServiceEligibility[]> => {
    await delay(100);
    return mockServiceEligibility[serviceId] ?? [];
  },
  createInstitutionServiceEligibility: async (_id: number, serviceId: string, input: ServiceEligibilityInput): Promise<ServiceEligibility> => {
    await delay(150);
    const row = mockEligibilityRecord(serviceId, input);
    mockServiceEligibility[serviceId] = [...(mockServiceEligibility[serviceId] ?? []), row];
    return row;
  },
  updateInstitutionServiceEligibility: async (_id: number, serviceId: string, eligibilityId: number, patch: ServiceEligibilityPatch): Promise<ServiceEligibility> => {
    await delay(150);
    const row = (mockServiceEligibility[serviceId] ?? []).find((r) => r.id === eligibilityId);
    if (!row) throw new Error("Eligibility requirement not found");
    Object.assign(row, patch, { min_score: patch.min_score != null ? String(patch.min_score) : row.min_score });
    return row;
  },
  deleteInstitutionServiceEligibility: async (_id: number, serviceId: string, eligibilityId: number): Promise<void> => {
    await delay(150);
    mockServiceEligibility[serviceId] = (mockServiceEligibility[serviceId] ?? []).filter((r) => r.id !== eligibilityId);
  },

  getInstitutionServiceStudyOptions: async (_id: number, serviceId: string): Promise<ServiceStudyOption[]> => {
    await delay(100);
    return mockServiceStudyOptions[serviceId] ?? [];
  },
  createInstitutionServiceStudyOption: async (_id: number, serviceId: string, input: ServiceStudyOptionInput): Promise<ServiceStudyOption> => {
    await delay(150);
    const row = mockStudyOptionRecord(serviceId, input);
    mockServiceStudyOptions[serviceId] = [...(mockServiceStudyOptions[serviceId] ?? []), row];
    return row;
  },
  updateInstitutionServiceStudyOption: async (_id: number, serviceId: string, optionId: number, patch: ServiceStudyOptionPatch): Promise<ServiceStudyOption> => {
    await delay(150);
    const row = (mockServiceStudyOptions[serviceId] ?? []).find((r) => r.id === optionId);
    if (!row) throw new Error("Study option not found");
    Object.assign(row, patch);
    return row;
  },
  deleteInstitutionServiceStudyOption: async (_id: number, serviceId: string, optionId: number): Promise<void> => {
    await delay(150);
    mockServiceStudyOptions[serviceId] = (mockServiceStudyOptions[serviceId] ?? []).filter((r) => r.id !== optionId);
  },

  getInstitutionServiceStudyUnits: async (_id: number, serviceId: string): Promise<ServiceStudyUnit[]> => {
    await delay(100);
    return mockServiceStudyUnits[serviceId] ?? [];
  },
  createInstitutionServiceStudyUnit: async (_id: number, serviceId: string, input: ServiceStudyUnitInput): Promise<ServiceStudyUnit> => {
    await delay(150);
    const row = mockStudyUnitRecord(serviceId, input);
    mockServiceStudyUnits[serviceId] = [...(mockServiceStudyUnits[serviceId] ?? []), row];
    return row;
  },
  updateInstitutionServiceStudyUnit: async (_id: number, serviceId: string, unitId: number, patch: ServiceStudyUnitPatch): Promise<ServiceStudyUnit> => {
    await delay(150);
    const row = (mockServiceStudyUnits[serviceId] ?? []).find((r) => r.id === unitId);
    if (!row) throw new Error("Study unit not found");
    Object.assign(row, patch);
    return row;
  },
  deleteInstitutionServiceStudyUnit: async (_id: number, serviceId: string, unitId: number): Promise<void> => {
    await delay(150);
    mockServiceStudyUnits[serviceId] = (mockServiceStudyUnits[serviceId] ?? []).filter((r) => r.id !== unitId);
  },

  getInstitutionServiceAccreditations: async (_id: number, serviceId: string): Promise<ServiceAccreditation[]> => {
    await delay(100);
    return mockServiceAccreditations[serviceId] ?? [];
  },
  createInstitutionServiceAccreditation: async (_id: number, serviceId: string, input: ServiceAccreditationInput): Promise<ServiceAccreditation> => {
    await delay(150);
    const row = mockAccreditationRecord(serviceId, input);
    mockServiceAccreditations[serviceId] = [...(mockServiceAccreditations[serviceId] ?? []), row];
    return row;
  },
  deleteInstitutionServiceAccreditation: async (_id: number, serviceId: string, rowId: number): Promise<void> => {
    await delay(150);
    mockServiceAccreditations[serviceId] = (mockServiceAccreditations[serviceId] ?? []).filter((r) => r.id !== rowId);
  },

  getInstitutionServiceMedia: async (_id: number, serviceId: string): Promise<{ files: ServiceMediaFile[] }> => {
    await delay(100);
    return { files: mockServiceMedia[serviceId] ?? [] };
  },
  uploadInstitutionServiceMedia: async (_id: number, serviceId: string, file: File): Promise<ServiceMediaFile> => {
    await delay(300);
    const row: ServiceMediaFile = { id: mockMediaFileId++, original_name: file.name, mime_type: file.type, size_bytes: file.size, url: URL.createObjectURL(file) };
    mockServiceMedia[serviceId] = [...(mockServiceMedia[serviceId] ?? []), row];
    return row;
  },
  deleteInstitutionServiceMedia: async (_id: number, serviceId: string, fileId: number): Promise<void> => {
    await delay(150);
    mockServiceMedia[serviceId] = (mockServiceMedia[serviceId] ?? []).filter((f) => f.id !== fileId);
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
    const role = mockRoles.find((r) => r.name === input.role) ?? mockRoles[mockRoles?.length - 1]!;
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
        id: uuid(), status: "active", created_at: new Date().toISOString(),
        partner_kind: "business", partner_id: biz.id, partner_name: biz.business_name, partner_logo_url: biz.logo_url, business_type: biz.business_type,
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

  getInstitutionRoles: async (_id: number): Promise<InstitutionRole[]> => {
    await delay(150);
    return [
      { id: 1, name: "owner", display_name: "Owner", description: null, is_system: true, sort_order: 0, permission_ids: [1, 2, 3], members_count: 1 },
      { id: 2, name: "admin", display_name: "Admin", description: null, is_system: true, sort_order: 1, permission_ids: [1, 2], members_count: 2 },
      { id: 3, name: "member", display_name: "Member", description: null, is_system: true, sort_order: 3, permission_ids: [], members_count: 3 },
    ];
  },
  getInstitutionPermissions: async (_id: number): Promise<InstitutionPermission[]> => {
    await delay(150);
    return [
      { id: 1, module: "members", action: "read", display_name: "View Members", description: null },
      { id: 2, module: "members", action: "write", display_name: "Manage Members", description: null },
      { id: 3, module: "courses", action: "read", display_name: "View Courses", description: null },
    ];
  },
  createInstitutionRole: async (_id: number, input: InstitutionRoleCreateInput): Promise<InstitutionRole> => {
    await delay(200);
    return { id: Math.floor(Math.random() * 1000) + 10, name: input.display_name.toLowerCase().replace(/\s+/g, "_"), display_name: input.display_name, description: input.description ?? null, is_system: false, sort_order: 99, permission_ids: input.permission_ids, members_count: 0 };
  },
  updateInstitutionRole: async (_id: number, roleId: number, patch: InstitutionRolePatch): Promise<InstitutionRole> => {
    await delay(200);
    return { id: roleId, name: "custom", display_name: patch.display_name ?? "Custom", description: patch.description ?? null, is_system: false, sort_order: 99, permission_ids: patch.permission_ids ?? [], members_count: 0 };
  },
  deleteInstitutionRole: async (_id: number, _roleId: number): Promise<void> => {
    await delay(200);
  },
};
