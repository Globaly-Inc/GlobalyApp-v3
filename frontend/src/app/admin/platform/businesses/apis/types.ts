export type BusinessStatus = "unverified" | "claim_pending" | "verified" | "suspended" | "rejected";

export type Business = {
  id: number;
  business_name: string;
  subdomain: string;
  business_type: string | null;
  business_category_id: number | null;
  category_name: string | null;
  email: string | null;
  phone: string | null;
  status: BusinessStatus;
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
  branch_count: number;
  service_count: number;
};

export type BusinessListParams = {
  search?: string;
  status?: string;
  category?: number;
};

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

// Subsidiary/franchise/partner links between businesses (business_representations) — "partner" type shown in the Partners tab.
export type RelationType = "partner" | "subsidiary" | "franchise";

export type BusinessRelation = {
  id: string;
  status: string;
  relation_type: RelationType;
  created_at: string;
  business_id: number;
  business_name: string;
  logo_url: string | null;
  business_type: string | null;
  country_ids: number[] | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
};

export type RelationInput = {
  partner_business_id: number;
  relation_type: RelationType;
  country_ids?: number[];
  valid_from?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  apply_to_branches?: boolean;
};

export type RelationPatch = Partial<Pick<RelationInput, "country_ids" | "valid_from" | "valid_until" | "notes">>;

export type RelationListParams = { page?: number; limit?: number };

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
  subdomain: string;
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
