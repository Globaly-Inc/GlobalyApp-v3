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
  /** ISO 3166-1 alpha-2, used for the flag beside the institution name. */
  country_code: string | null;
  /** Crest of the promoted institution that shares this course's extraction job. */
  institution_logo_url: string | null;
  /** Campus cities of that institution — the card's "Location:" chips. */
  campus_locations: string[];
  /** First installment amount, present only when the fee actually splits into several payments. */
  domestic_fee_installment: string | null;
  international_fee_installment: string | null;
};

/** Facets for the institutions filter panel — only values the catalog actually contains. */
export type InstitutionFilterOptions = {
  institution_types: string[];
  /** "YYYY-MM", earliest first. */
  intake_months: string[];
  /** Catalog facets: what the published institutions actually teach. */
  subject_areas: string[];
  degree_levels: string[];
  study_modes: string[];
};

/** One row of the admin-managed business category catalog, as the public switcher reads it. */
export type BusinessCategory = {
  slug: string;
  name: string;
  icon: string | null;
};

export type VisaServiceFilterOptions = {
  /** What kind of work the provider does: visa_application, appeal, … */
  service_types: string[];
};

export type CourseFilterOptions = {
  years: number[];
  currencies: string[];
  degree_levels: string[];
  /** Awarding institutions with at least one visible course. */
  institutions: string[];
};

/**
 * Duration buckets for the courses filter, as the "min-max" weeks the API expects. Buckets rather
 * than a free number: durations cluster on a handful of values, so a slider would mostly land on
 * gaps.
 */
export const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: "0-26", label: "Up to 6 months" },
  { value: "27-52", label: "6 months – 1 year" },
  { value: "53-104", label: "1 – 2 years" },
  { value: "105-156", label: "2 – 3 years" },
  { value: "157-", label: "3 years +" },
];

export type CompareCourseItem = {
  id: string;
  slug: string;
  name: string;
  institutionName?: string;
  institutionLogoUrl?: string | null;
  countryName?: string;
  durationLabel?: string | null;
  subjectArea?: string | null;
  nextIntakeLabel?: string;
  annualTuition?: number | null;
  feeCurrency?: string;
  /** Campus cities offering this course, for the compare page's "Branch" row. */
  branches?: string[];
  /** Raw degree_level key (see DEGREE_LABEL) for the compare page's "Level" row. */
  level?: string | null;
};

/** Extraction writes the row's caption as `label`; older imports used `name`. */
export type FeeInstallment = { label?: string | null; name?: string | null; amount?: number | string | null; due_date?: string | null };

export type CourseIntake = {
  id: string;
  intake_name: string | null;
  start_date: string | null;
  admission_deadline: string | null;
  intake_month: number | null;
  intake_year: number | null;
};

/** Rows of an eligibility requirement's `academic_tests` / `language_tests` jsonb. */
export type EligibilityAcademicTest = { test_name: string; score?: string };
export type EligibilityLanguageTest = { test_type_name: string; overall_score?: string };

export type CourseEligibility = {
  id: string;
  applicable_to: string;
  min_degree_level: string | null;
  min_score_percent: string | null;
  min_score_grade: string | null;
  description: string | null;
  academic_tests: EligibilityAcademicTest[] | null;
  language_tests: EligibilityLanguageTest[] | null;
};

export type CourseEnglishRequirement = {
  id: string;
  test_type_name: string | null;
  overall_score: string | null;
  listening_score: string | null;
  reading_score: string | null;
  writing_score: string | null;
  speaking_score: string | null;
};

/** The awarding institution, enough of it to render the course hero and link to its profile. */
export type CourseInstitution = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  city: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  /** Signed preview URLs for the institution's `gallery_images`, resolved server-side. */
  gallery_image_urls: string[];
};

/** One season's entry in `countries.weather_*` — free-form JSON, so every field is optional. */
export type WeatherSeason = { temp_range?: string; description?: string } | null;

export type CourseWeather = {
  summer: WeatherSeason;
  autumn: WeatherSeason;
  winter: WeatherSeason;
  spring: WeatherSeason;
};

export type CourseDetail = SearchCourse & {
  intakes: CourseIntake[];
  eligibility: CourseEligibility[];
  englishRequirements: CourseEnglishRequirement[];
  institution: CourseInstitution | null;
  campuses: InstitutionCampus[];
  weather: CourseWeather | null;
  /** Full payment schedule, when the fee splits — `[{ name?, amount }]`. */
  domestic_fee_installments: FeeInstallment[] | null;
  international_fee_installments: FeeInstallment[] | null;
  /** The platform's city page for the campus city, when one is published. */
  city_link: { name: string; href: string } | null;
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
  status?: string;
  category_name?: string | null;
  website: string | null;
  email: string | null;
  service_count?: number;
  location_count?: number;
  course_count?: number;
  /** Institution-card fields, derived from the institution's scraped catalog and campuses. */
  country_code?: string | null;
  institution_type?: string | null;
  subject_area_count?: number;
  study_modes?: string[];
  campus_locations?: string[];
};

/** A campus of a scraped institution — `extraction_campuses`, keyed to its extraction job. */
export type InstitutionCampus = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

export type InstitutionMember = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  role: string;
  is_owner: boolean;
};

/** One row of the catalog breakdown — a degree level with its course count. */
export type CourseFacet = { name: string; count: number };

/** A subject area with the degree spread and fee range of the courses filed under it. */
export type SubjectAreaSummary = {
  name: string;
  count: number;
  degrees: CourseFacet[];
  cost_min: number | null;
  cost_max: number | null;
  currency: string | null;
};

export type InstitutionDetail = SearchBusiness & {
  cover_url: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  postcode: string | null;
  registration_number: string | null;
  registration_licenses: Record<string, unknown> | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  company_size: string | null;
  created_at: string | null;
  video_urls: string[] | null;
  /** Signed preview URLs for `gallery_images`, resolved server-side. */
  gallery_image_urls?: (string | null)[];
  campuses: InstitutionCampus[];
  members: InstitutionMember[];
  subject_areas: SubjectAreaSummary[];
  degree_levels: CourseFacet[];
};

/**
 * A scraped visa-service provider — extraction-catalog only, so it has a slug but no subdomain
 * and none of the tenant-backed sections (branches, team) a real business profile carries.
 */
export type VisaServiceProviderDetail = {
  id: string;
  slug: string;
  business_name: string;
  logo_url: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  source_url: string | null;
  services: VisaServiceItem[];
};

export type VisaServiceItem = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  registration_number: string | null;
  registration_body: string | null;
  registration_status: string | null;
  registration_expiry: string | null;
  visa_types_handled: string[] | null;
  specializations: string[] | null;
  languages_spoken: string[] | null;
  fee_amount: string | null;
  fee_currency: string | null;
  fee_type: string | null;
  fee_from: string | null;
  fee_to: string | null;
  consultation_fee: string | null;
  consultation_free: boolean | null;
  years_experience: number | null;
  countries_serviced: string[] | null;
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
  partner_kind: "business" | "institution";
  partner_id: number;
  partner_name: string;
  partner_logo_url: string | null;
};

export type BusinessDetail = SearchBusiness & {
  cover_url: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  postcode: string | null;
  latitude: string | null;
  longitude: string | null;
  business_registration_number: string | null;
  registration_licenses: Record<string, unknown> | null;
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

export type SearchService = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  category_name: string | null;
  business_id: number;
  business_name: string;
  business_subdomain: string;
  logo_url: string | null;
};

export type SearchTabKey =
  | "courses"
  | "institutions"
  | "education-agencies"
  | "visa-services"
  | "migration-agents"
  | "jobs"
  | "scholarships"
  | "services";

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

export const COVERAGE_LABEL: Record<string, string> = {
  full_tuition: "Full Tuition",
  partial_tuition: "Partial Tuition",
  living_allowance: "Living Allowance",
  stipend: "Stipend",
  travel: "Travel",
  various: "Various",
  other: "Other",
};

/** Scraped visa-service work types. */
export const VISA_SERVICE_TYPE_LABEL: Record<string, string> = {
  visa_application: "Visa Application",
  appeal: "Appeals & Reviews",
  migration_advice: "Migration Advice",
  sponsorship: "Sponsorship",
  other: "Other",
};

export const BASIS_LABEL: Record<string, string> = {
  merit: "Merit", need: "Need", sports: "Sports", diversity: "Diversity",
  government: "Government", research: "Research", other: "Other",
};

export const STUDY_MODE_LABEL: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  online: "Online",
  on_campus: "On Campus",
  blended: "Blended",
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  casual: "Casual",
  contract: "Contract",
  internship: "Internship",
};

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How the card's headline fee is expressed. Display-only — it never reaches the API, because
 * every figure it needs (installment, total, duration) is already on the course row.
 */
export type FeePeriod = "per_semester" | "per_year" | "total";

export const FEE_PERIOD_OPTIONS: { value: FeePeriod; label: string }[] = [
  { value: "per_semester", label: "Per Semester" },
  { value: "per_year", label: "Per Year" },
  { value: "total", label: "Total" },
];

export const DEFAULT_FEE_PERIOD: FeePeriod = "per_semester";

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "best_match", label: "Relevance" },
  { value: "fee_asc", label: "Fee: Low to High" },
  { value: "fee_desc", label: "Fee: High to Low" },
  { value: "duration_asc", label: "Duration: Shortest" },
];

export const CURRENCY_OPTIONS = ["AUD", "USD", "GBP", "CAD", "INR", "NPR"];
