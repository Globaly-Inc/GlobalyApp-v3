export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type SearchCourse = {
  id: string;
  name: string;
  short_name: string | null;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  description: string | null;
  domestic_fee_total: string | null;
  domestic_currency: string | null;
  international_fee_total: string | null;
  international_currency: string | null;
  awarding_institution: string | null;
  image_url: string | null;
  /** The course page on the institution's own website. */
  source_url?: string | null;
  country_name: string | null;
  next_intake_year: number | null;
  next_intake_month: number | null;
  slug: string;
};

export type CourseFilterOptions = {
  years: number[];
  currencies: string[];
};

export type CompareCourseItem = {
  id: string;
  slug: string;
  name: string;
  institutionName?: string;
  countryName?: string;
  durationLabel?: string | null;
  subjectArea?: string | null;
  nextIntakeLabel?: string;
  annualTuition?: number | null;
  feeCurrency?: string;
};

export type CourseIntake = {
  id: string;
  intake_name: string | null;
  start_date: string | null;
  admission_deadline: string | null;
  intake_month: number | null;
  intake_year: number | null;
};

export type CourseEligibility = {
  id: string;
  applicable_to: string;
  min_degree_level: string | null;
  min_score_percent: string | null;
  min_score_grade: string | null;
  description: string | null;
};

export type CourseEnglishRequirement = {
  id: string;
  test_type_name: string | null;
  overall_score: string | null;
};

export type CourseDetail = SearchCourse & {
  intakes: CourseIntake[];
  eligibility: CourseEligibility[];
  englishRequirements: CourseEnglishRequirement[];
};

export type SearchBusiness = {
  id: number | string;
  business_name: string;
  subdomain?: string;
  slug?: string;
  logo_url: string | null;
  description: string | null;
  city: string | null;
  country_name: string | null;
  website: string | null;
  email: string | null;
  service_count?: number;
  location_count?: number;
  course_count?: number;
};

export type InstitutionDetail = SearchBusiness & {
  phone: string | null;
  address: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
};

export type BusinessBranch = {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  branch_type: string;
};

export type BusinessMember = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  is_owner: boolean;
  admin_point_of_contact: boolean;
  role_display: string;
};

export type BusinessService = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
};

export type BusinessRepresentation = {
  id: string;
  partner_business_id: number;
  partner_business_name: string;
  partner_business_logo_url: string | null;
  relation_type: string;
};

export type BusinessDetail = SearchBusiness & {
  cover_url: string | null;
  phone: string | null;
  address: string | null;
  category_name: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  branches: BusinessBranch[];
  members: BusinessMember[];
  services: BusinessService[];
  representations: BusinessRepresentation[];
};

export type SearchJob = {
  id: number;
  title: string;
  description: string | null;
  job_type: string | null;
  location_city: string | null;
  country_name: string | null;
  is_remote: boolean;
  pay_min: string | null;
  pay_max: string | null;
  pay_currency: string | null;
  pay_unit: string | null;
  closing_date: string | null;
  created_at: string;
  company_name: string | null;
  company_name_from_business: string | null;
  logo_url: string | null;
};

export type SearchScholarship = {
  id: number;
  title: string;
  slug: string;
  provider_name: string | null;
  country: string | null;
  city: string | null;
  basis: string | null;
  degree_levels: string[];
  coverage_type: string;
  coverage_amount: number | null;
  coverage_currency: string | null;
  deadline: string | null;
  is_featured: boolean;
};

export type SearchTabKey =
  | "courses"
  | "institutions"
  | "education-agencies"
  | "visa-services"
  | "migration-agents"
  | "jobs"
  | "scholarships";

export const DEGREE_LABEL: Record<string, string> = {
  certificate: "Certificate",
  diploma: "Diploma",
  associate: "Associate Degree",
  bachelor: "Bachelor's",
  graduate_certificate: "Graduate Certificate",
  graduate_diploma: "Graduate Diploma",
  master: "Master's",
  doctoral: "Doctoral (PhD)",
  other: "Other",
};

export const BASIS_LABEL: Record<string, string> = {
  merit: "Merit", need: "Need", sports: "Sports", diversity: "Diversity",
  government: "Government", research: "Research", other: "Other",
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  casual: "Casual",
  contract: "Contract",
  internship: "Internship",
};

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "best_match", label: "Best match" },
  { value: "fee_asc", label: "Fee: Low to High" },
  { value: "fee_desc", label: "Fee: High to Low" },
  { value: "duration_asc", label: "Duration: Shortest" },
];

export const CURRENCY_OPTIONS = ["AUD", "USD", "GBP", "CAD", "INR", "NPR"];
