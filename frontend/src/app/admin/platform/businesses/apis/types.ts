export type BusinessStatus = "unverified" | "claim_pending" | "claimed" | "verified" | "suspended" | "rejected";
export type BusinessClaimStatus = "unclaimed" | "claim_pending" | "claimed";

/**
 * Which table the row came from. Businesses and institutions are the same kind of record kept in
 * two tables, and this list shows both, so `id` alone is ambiguous — id 3 exists in each.
 * Anything that navigates to or mutates a row must branch on this.
 */
export type ListingKind = "business" | "institution";

/** Identifies one row in a list that mixes both tables — `id` alone is ambiguous. */
export type ListingRef = { kind: ListingKind; id: number };

export type Business = {
  kind: ListingKind;
  id: number;
  business_name: string;
  subdomain: string;
  business_type: string | null;
  business_category_id: number | null;
  category_name: string | null;
  email: string | null;
  phone: string | null;
  status: BusinessStatus;
  claim_status: BusinessClaimStatus;
  is_published: boolean;
  country_id: number | null;
  country_name: string | null;
  city: string | null;
  logo_url: string | null;
  account_status: number;
  created_at: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  is_unclaimed: boolean;
  profile_views: number;
  source_job_id: string | null;
  branch_count: number;
  service_count: number;
};

export type BusinessSort = "name_asc" | "name_desc" | "created_desc" | "created_asc";

export type BusinessListParams = {
  search?: string;
  status?: string;
  category?: number;
  /** Forces which table(s) to query, independent of `category` — e.g. a consultancy picker
   *  that wants every business, no category restriction, and never institutions. */
  kind?: ListingKind;
  page?: number;
  limit?: number;
  sort?: BusinessSort;
};

export type BusinessListResult = { data: Business[]; total: number };

export type BusinessDetail = Business & {
  description: string | null;
  website: string | null;
  state: string | null;
  address: string | null;
  postcode: string | null;
  cover_url: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
  verified_at: string | null;
  updated_at: string;
  enquiry_enabled: boolean;
  enquiry_coin_cost: number;
  enquiry_max_distributions: number;
};

export type InstitutionDetail = {
  kind: "institution";
  id: number;
  slug: string;
  business_name: string;
  subdomain: string;
  business_type: string | null;
  description: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  status: BusinessStatus;
  claim_status: BusinessClaimStatus;
  is_published: boolean;
  country_id: number | null;
  country_name: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  logo_url: string | null;
  cover_url: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
  account_status: number;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  owner_id: number | null;
  is_unclaimed: boolean;
  business_category_id: number | null;
  category_name: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  source_job_id: string | null;
  /** Borrowed from the source extraction job (course/campus counts) — 0 when there's no source_job_id. */
  branch_count: number;
  service_count: number;
};

export type InstitutionPatch = Partial<{
  business_name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  logo_url: string | null;
  cover_url: string | null;
}>;

/** A subset of `extraction_courses` columns — the institution's courses if it was promoted from
 *  an extraction job (source_job_id), read-only here (editing happens in the extraction admin). */
export type InstitutionCourse = {
  id: string;
  slug: string;
  name: string;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  domestic_fee_total: number | null;
  domestic_currency: string | null;
  verification_status: string | null;
  source_url: string | null;
};

/** A subset of `extraction_campuses` columns — same provenance rule as InstitutionCourse. */
export type InstitutionBranch = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  source_url: string | null;
};

/** A subset of `extraction_agents` columns — same provenance rule as InstitutionCourse. */
export type InstitutionPartner = {
  id: string;
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  source_url: string | null;
};

/** GET /institutions/:id/partners merges manually-linked consultancies (real CRUD, same
 *  business_representations row shape as BusinessRelation) with read-only scraped agents —
 *  `source` says which, and only "manual" rows get edit/delete affordances. */
export type InstitutionPartnerRow = (BusinessRelation & { source: "manual" }) | (InstitutionPartner & { source: "extracted" });

export type InstitutionPartnerInput = {
  business_id: number;
  country_ids?: number[];
  valid_from?: string | null;
  valid_until?: string | null;
  notes?: string | null;
};

export type InstitutionPartnerPatch = Partial<Pick<InstitutionPartnerInput, "country_ids" | "valid_from" | "valid_until" | "notes">>;

export type InstitutionPartnerListParams = { search?: string; page?: number; limit?: number };

export type InstitutionPartnerListResult = { data: InstitutionPartnerRow[]; total: number };

export type InstitutionCourseListParams = { search?: string; page?: number; limit?: number };

export type InstitutionCourseListResult = { data: InstitutionCourse[]; total: number };

export type InstitutionBranchListParams = { search?: string; page?: number; limit?: number };

export type InstitutionBranchListResult = { data: InstitutionBranch[]; total: number };

export type InstitutionInviteInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
};

export type InstitutionInvitation = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  invited_at: string;
  expires_at: string;
};

export type InstitutionInvitationListParams = { page?: number; limit?: number };

export type InstitutionPermission = {
  id: number;
  module: string;
  action: string;
  display_name: string;
  description: string | null;
};

export type InstitutionRole = {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  permission_ids: number[];
  members_count: number;
};

export type InstitutionRoleCreateInput = {
  display_name: string;
  description?: string | null;
  permission_ids: number[];
};

export type InstitutionRolePatch = Partial<InstitutionRoleCreateInput>;

export type InstitutionInvitationListResult = { data: InstitutionInvitation[]; total: number };

export type EnquirySettingsPatch = Partial<{
  enquiry_enabled: boolean;
  enquiry_coin_cost: number;
  enquiry_max_distributions: number;
}>;

export type SharedServices = "all" | string[];

export type Branch = {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  linked_business_id: number | null;
  branch_type: BranchType;
  share_description: boolean;
  shared_services: SharedServices;
  created_at: string;
};

export type BranchType = "same_company" | "subsidiary" | "franchise";

export type BranchFilter = "all" | "linked_branches" | "branches_only";

export type BranchListParams = {
  search?: string;
  page?: number;
  limit?: number;
  filter_branch?: BranchFilter;
};

export type BranchListResult = { data: Branch[]; total: number };

export type BranchInput = {
  name: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  branch_type?: BranchType;
  share_description?: boolean;
  shared_services?: SharedServices;
};

export type BranchPatch = Partial<BranchInput>;

export type LinkExistingBranchInput = {
  business_id: number;
  branch_type: BranchType;
  shared_services: SharedServices;
};

export type LinkExistingBranchResult = {
  branch: Branch;
};

export type BusinessService = {
  id: string;
  service_category_id: number | null;
  category_name: string | null;
  name: string;
  description: string | null;
  price: string | null;
  is_published: boolean;
  created_at: string;
};

export type ServiceInput = {
  name: string;
  service_category_id: number | null;
  description?: string | null;
  price?: number | null;
};

export type ServiceSearchParams = {
  search?: string;
  page?: number;
  limit?: number;
};

export type ServiceSearchResult = { data: BusinessService[]; total: number };

export type ServicePatch = Partial<ServiceInput> & { is_published?: boolean };

export type SchemaFieldValue = { schema_field_id: number; value: unknown };

export type Member = {
  id: number;
  platform_user_id: number;
  is_owner: boolean;
  account_status: number;
  admin_point_of_contact: boolean;
  created_at: string;
  role_name: string | null;
  role_display_name: string | null;
  user: { id: number; first_name: string; last_name: string; email: string; phone: string | null; photo_url: string | null } | null;
};

export type MemberRole = { id: number; name: string; display_name: string };

export type MemberListParams = {
  search?: string;
  page?: number;
  limit?: number;
  point_of_contact?: boolean;
};

export type MemberListResult = { data: Member[]; total: number };

export type MemberInviteInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
  admin_point_of_contact?: boolean;
};

export type MemberPatch = Partial<{
  role: string;
  admin_point_of_contact: boolean;
  account_status: number;
  is_owner: boolean;
}>;

export type PartnerKind = "business" | "institution";

export type BusinessRelation = {
  id: string;
  status: string;
  created_at: string;
  partner_kind: PartnerKind;
  partner_id: number;
  partner_name: string;
  partner_logo_url: string | null;
  business_type: string | null;
  country_ids: number[] | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
};

export type RelationInput = {
  partner_business_id: number;
  country_ids?: number[];
  valid_from?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  apply_to_branches?: boolean;
};

export type RelationPatch = Partial<Pick<RelationInput, "country_ids" | "valid_from" | "valid_until" | "notes">>;

export type RelationListParams = { search?: string; page?: number; limit?: number };

export type RelationListResult = { data: BusinessRelation[]; total: number };

export type ActivityLogEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  admin_first_name: string | null;
  admin_last_name: string | null;
};

export type ActivityListParams = { page?: number; limit?: number };

export type ActivityListResult = { data: ActivityLogEntry[]; total: number };

export type BusinessCreateInput = {
  business_name: string;
  business_category_id: number;
  description?: string | null;
  email: string; // also used to create/find the business owner account
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  website?: string | null;
  country_id?: number | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logo_url?: string | null;
  cover_url?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  allowed_service_category_ids?: number[];
};

export type PlaceSuggestion = { placeId: string; description: string };

export type PlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postcode: string | null;
};

export type BusinessPatch = Partial<{
  business_name: string;
  business_type: string | null;
  business_category_id: number | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  logo_url: string | null;
  cover_url: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
}>;
