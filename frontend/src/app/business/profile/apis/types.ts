export type SharedServices = "all" | string[];

export type BranchType = "same_company" | "subsidiary" | "franchise";

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

export type LinkExistingBranchResult = { branch: Branch };

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
  role_id: number;
  role: string;
  role_display: string;
  is_owner: boolean;
  account_status: number;
  admin_point_of_contact: boolean;
  position: string | null;
  is_public: boolean;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
};

export type MemberRole = { id: number; name: string; display_name: string };

export type MemberListParams = { page?: number; limit?: number };

export type MemberListResult = { data: Member[]; total: number };

export type MemberInviteInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
  admin_point_of_contact?: boolean;
  position?: string | null;
};

export type MemberPatch = Partial<{
  role: string;
  admin_point_of_contact: boolean;
  account_status: number;
  is_owner: boolean;
  position: string | null;
  is_public: boolean;
}>;

export type InvitedMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  admin_point_of_contact: boolean;
  invited_at: string;
  expires_at: string;
};

export type InvitationListResult = { data: InvitedMember[]; total: number };

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

export type BusinessSearchParams = { search?: string; limit?: number };

export type BusinessSearchResult = { id: number; business_name: string; logo_url: string | null };

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

export type ScholarshipSourceType = "university" | "independent" | "government" | "foundation" | "other";
export type ScholarshipBasis = "merit" | "need" | "sports" | "diversity" | "government" | "research" | "other";
export type ScholarshipCoverageType = "full_tuition" | "partial_tuition" | "stipend" | "living_allowance" | "various" | "other";

export type Scholarship = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  provider_name: string | null;
  source_type: ScholarshipSourceType;
  country: string | null;
  city: string | null;
  region: string | null;
  basis: ScholarshipBasis | null;
  degree_levels: string[];
  requirements_summary: string | null;
  coverage_type: ScholarshipCoverageType;
  coverage_amount: number | null;
  coverage_currency: string | null;
  coverage_description: string | null;
  deadline: string | null;
  deadline_notes: string | null;
  application_url: string | null;
  source_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type ScholarshipInput = {
  title: string;
  slug: string;
  description?: string | null;
  provider_name?: string | null;
  source_type?: ScholarshipSourceType;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  basis?: ScholarshipBasis | null;
  degree_levels?: string[];
  requirements_summary?: string | null;
  coverage_type?: ScholarshipCoverageType;
  coverage_amount?: number | null;
  coverage_currency?: string | null;
  coverage_description?: string | null;
  deadline?: string | null;
  deadline_notes?: string | null;
  application_url?: string | null;
  source_url?: string | null;
  is_published?: boolean;
};

export type ScholarshipPatch = Partial<ScholarshipInput>;

export type ScholarshipListParams = { search?: string; page?: number; limit?: number };

export type ScholarshipListResult = { data: Scholarship[]; total: number };
