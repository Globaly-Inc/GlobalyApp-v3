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
  public_visibility: Record<string, boolean> | null;
  created_at: string;
  degree_level: string | null;
  area_of_study: string | null;
  duration: string | null;
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

export type ServicePatch = Partial<ServiceInput> & { is_published?: boolean; public_visibility?: Record<string, boolean> | null };

export type SchemaFieldValue = { schema_field_id: number; value: unknown };

// ─── Service details family (fees / intakes / eligibility / study options / study units / accreditations) ───

export type ServiceFee = {
  id: number;
  name: string | null;
  student_type: "domestic" | "international" | "both";
  period_type: string;
  currency: string;
  total_amount: number;
  installments: Record<string, unknown>[];
};
export type ServiceFeeInput = Omit<ServiceFee, "id">;
export type ServiceFeePatch = Partial<ServiceFeeInput>;

export type ServiceIntake = {
  id: number;
  intake_name: string | null;
  start_date: string | null;
  end_date: string | null;
  orientation_date: string | null;
  admission_deadline: string | null;
  intake_month: number | null;
  intake_year: number | null;
};
export type ServiceIntakeInput = Omit<ServiceIntake, "id">;
export type ServiceIntakePatch = Partial<ServiceIntakeInput>;

export type ServiceEligibility = {
  id: number;
  name: string | null;
  applicable_to: "domestic" | "international" | "both";
  degree_level_id: number | null;
  score_type: "percentage" | "gpa_4" | "gpa_10" | "cgpa" | null;
  min_score: number | null;
  description: string | null;
  academic_tests: Record<string, unknown>[];
  language_tests: Record<string, unknown>[];
};
export type ServiceEligibilityInput = Omit<ServiceEligibility, "id">;
export type ServiceEligibilityPatch = Partial<ServiceEligibilityInput>;

export type ServiceStudyOption = {
  id: number;
  name: string | null;
  study_mode: "on_campus" | "online" | "hybrid";
  study_load: "full_time" | "part_time";
  duration_value: number | null;
  duration_unit: "days" | "weeks" | "months" | "years";
  applicable_to: "domestic" | "international" | "both";
};
export type ServiceStudyOptionInput = Omit<ServiceStudyOption, "id">;
export type ServiceStudyOptionPatch = Partial<ServiceStudyOptionInput>;

export type ServiceStudyUnit = {
  id: number;
  unit_code: string | null;
  unit_name: string;
  credit_points: number | null;
  description: string | null;
  unit_type: "compulsory" | "elective";
};
export type ServiceStudyUnitInput = Omit<ServiceStudyUnit, "id">;
export type ServiceStudyUnitPatch = Partial<ServiceStudyUnitInput>;

export type ServiceAccreditationLink = { id: number; accreditation_id: number };

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

export type Permission = {
  id: number;
  module: string;
  action: string;
  display_name: string;
  description: string | null;
};

export type Role = {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  permission_ids: number[];
  members_count: number;
};

export type RoleCreateInput = {
  display_name: string;
  description?: string | null;
  permission_ids: number[];
};

export type RolePatch = Partial<RoleCreateInput>;

export type MemberListParams = { page?: number; limit?: number; search?: string };

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
  /** Which table partner_business_id points at. Omitted means "business", as the API defaults. */
  partner_kind?: PartnerKind;
  country_ids?: number[];
  valid_from?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  apply_to_branches?: boolean;
};

export type RelationPatch = Partial<Pick<RelationInput, "country_ids" | "valid_from" | "valid_until" | "notes">>;

export type RelationListParams = { page?: number; limit?: number };

export type RelationListResult = { data: BusinessRelation[]; total: number };

export type PartnerInstitutionDetail = {
  id: number;
  institution_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  logo_url: string | null;
  cover_url: string | null;
};

export type PartnerInstitutionCourse = {
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

export type PartnerInstitutionCourseListParams = { search?: string; page?: number; limit?: number };

export type PartnerInstitutionCourseListResult = { data: PartnerInstitutionCourse[]; total: number };

export type BusinessSearchParams = { search?: string; limit?: number; include_institutions?: boolean };

// `business_name` is the label for both kinds — the API aliases institution_name onto it, the
// same way listRelations coalesces the two into partner_name. `kind` is what disambiguates the
// id, which is NOT unique across the two tables.
export type BusinessSearchResult = {
  kind: PartnerKind;
  id: number;
  business_name: string;
  logo_url: string | null;
};

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
  is_featured: boolean;
  view_count: number;
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
  is_featured?: boolean;
};

export type ScholarshipPatch = Partial<ScholarshipInput>;

export type ScholarshipListParams = { search?: string; page?: number; limit?: number };

export type ScholarshipListResult = { data: Scholarship[]; total: number };
