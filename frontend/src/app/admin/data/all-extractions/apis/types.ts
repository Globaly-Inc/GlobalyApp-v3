import type { DashboardMode, SortOrder } from "../const";

export type ExtractionStatus =
  | "pending"
  | "mapping"
  | "scraping"
  | "extracting"
  | "processing"
  | "verifying"
  | "review"
  | "verified"
  | "approved"
  | "done"
  | "completed"
  | "exported"
  | "pushed"
  | "declined"
  | "failed"
  | "stalled"
  | "paused";

/** Who hand-added and who last edited a row, resolved from the platform user ids the
 *  backend stores. A null created_by_name means the pipeline scraped the row — nobody
 *  typed it in. Present on every extraction row the admin UI can edit. */
export type ActorFields = {
  created_by_name?: string | null;
  created_by_email?: string | null;
  updated_by_name?: string | null;
  updated_by_email?: string | null;
};

export type ExtractionJob = ActorFields & {
  id: string;
  institution_name: string | null;
  institution_url: string;
  status: ExtractionStatus;
  total_pages_found: number;
  courses_extracted: number;
  verification_score: number;
  verification_total: number;
  pages_scraped: number;
  pages_failed: number;
  agent_count?: number;
  campus_count?: number;
  source_type?: string | null;
  aggregator_name?: string | null;
  sample_course_url?: string | null;
  business_category_id?: number | null;
  business_category_name?: string | null;
  service_category_id?: number | null;
  service_category_name?: string | null;
  guided_urls?: Record<string, unknown> | null;
  guidance_notes?: string | null;
  pipeline_progress?: Record<string, unknown> | null;
  supporting_documents?: SupportingDoc[] | null;
  error_message?: string | null;
  processing_heartbeat_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineStage = { status: string; total?: number; done?: number };

/** Loose map — the AI pipeline writes mapping/intelligence/scraping/..., per-tab reruns write others. */
export type PipelineProgress = Record<string, PipelineStage | undefined>;

export type SupportingDoc = {
  file_name: string;
  file_url: string;
  guidance?: string;
};

export type CreateJobParams = {
  institution_url: string;
  business_category_id?: number;
  service_category_id?: number;
  source_type?: string;
  guided_urls?: Record<string, string[]>;
  guidance_notes?: string;
  sample_course_url?: string;
};

export type ExistingJobConflict = {
  id: string;
  institutionName: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
};

export type InstitutionOverview = ActorFields & {
  id: string;
  name: string | null;
  website: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  /** "public" | "private" | null — ownership, not the educational category. */
  ownership_type: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  /** Social/profile links that don't fit a known platform column (TikTok, Threads, etc), each
   * with a label — either LLM-guessed from the platform or set manually by an admin. */
  other_social_links: { label: string; url: string }[] | null;
  updated_at?: string | null;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  statusCounts?: { status: string; count: number }[];
};

export type JobsPageMeta = { page: number; limit: number; total: number; totalPages: number };

export type GetJobsParams = {
  mode: DashboardMode;
  page: number;
  limit: number;
  sort: SortOrder;
  statusLabel?: string;
  sourceFilter?: string;
  businessCategoryId?: number;
  showDeclined: boolean;
  q?: string;
};

export type GetJobsResult = { jobs: ExtractionJob[]; meta: JobsPageMeta };

// Shared shape for the row types we only need to count and find the most
// recent timestamp of, on the Overview tab's "Extraction Details by Tab" cards.
export type TimestampedRow = { updated_at?: string | null; created_at?: string | null };

export type CampusRow = ActorFields & TimestampedRow & { id: string };
export type AgentRow = ActorFields & TimestampedRow & { id: string };
export type CourseRow = ActorFields & TimestampedRow & { id: string; name: string; verification_status?: string | null };

export type CourseAssignment = { id: string; course_id: string; course_name: string | null } & Record<string, string | null>;

/** Junction slugs the backend's /junctions/:junction/assign endpoint accepts. */
export type JunctionSlug =
  | "course-fees"
  | "intakes"
  | "eligibility-requirements"
  | "study-units"
  | "study-options"
  | "accreditations"
  | "campuses";

export type CourseLinks = {
  course_fees: CourseFee[];
  intakes: Intake[];
  eligibility_requirements: EligibilityRequirement[];
  study_units: StudyUnit[];
  study_options: StudyOption[];
  accreditations: Accreditation[];
  fee_assignments: CourseAssignment[];
  intake_assignments: CourseAssignment[];
  eligibility_assignments: CourseAssignment[];
  study_unit_assignments: CourseAssignment[];
  study_option_assignments: CourseAssignment[];
  accreditation_assignments: CourseAssignment[];
  course_campuses: CourseAssignment[];
};

export type TabCounts = {
  branches: number;
  agents: number;
  courses: number;
  fees: number;
  intakes: number;
  eligibility: number;
  units: number;
  study_options: number;
  accreditations: number;
  visa_services: number;
};

export type JobFull = {
  job: ExtractionJob;
  overview: InstitutionOverview | null;
  campuses: CampusRow[];
  agents: AgentRow[];
  tabCounts: TabCounts;
  courseLinks: CourseLinks;
  /** Only populated for source_type: "visa_service" jobs — empty array otherwise. */
  visaServices: VisaService[];
};

// ── Full entity types for tab views ──────────────────────────────

export type CourseFull = ActorFields & {
  id: string;
  name: string;
  short_name?: string | null;
  source_url: string | null;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  description: string | null;
  domestic_fee_total: number | null;
  domestic_currency: string | null;
  international_fee_total: number | null;
  international_currency: string | null;
  awarding_institution: string | null;
  career_paths: string[] | null;
  verification_status: string | null;
  created_at: string;
  updated_at: string;
};

export type CampusFull = ActorFields & {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  map_link: string | null;
  source_url: string | null;
  postcode: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentFull = ActorFields & {
  id: string;
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  source_url: string | null;
  external_id: string | null;
  source_status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  created_at: string;
  updated_at: string;
};

export type QueueItem = {
  id: string;
  job_id: string;
  url: string;
  status: string;
  error: string | null;
  extracted_data: Record<string, unknown> | null;
  retry_count: number;
  failure_class: string | null;
  processing_meta: Record<string, unknown>;
  kind: string;
  created_at: string;
  updated_at: string;
};

export type JobEvent = {
  id: string;
  job_id: string;
  kind: string;
  level: string;
  phase: string | null;
  message: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

/** Matches the backend's CreateAgentSchema. */
export type CreateAgentParams = { job_id: string } & Partial<
  Record<"name" | "country" | "email" | "phone" | "website" | "address" | "city" | "state" | "postcode", string | null>
>;

/** A row of superadmin.agent_extraction_runs — the Agents tab's extraction history. */
export type AgentRun = {
  id: string;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  provider: string | null;
  agents_found: number;
  agents_new: number;
  agents_updated: number;
  agents_removed: number;
  error_message: string | null;
};

/** Matches the backend's CreateCampusSchema — every field but job_id is optional. */
export type CreateCampusParams = { job_id: string } & Partial<
  Record<"name" | "address" | "city" | "state" | "country" | "phone" | "email" | "map_link" | "postcode" | "source_url", string | null>
>;

export type UpdateCourseParams = Partial<Omit<CourseFull, "id" | "created_at" | "updated_at" | "verification_status">>;
export type CreateCourseParams = {
  name: string;
  source_url?: string | null;
  degree_level?: string | null;
  subject_area?: string | null;
  duration_weeks?: number | null;
  study_mode?: string | null;
  description?: string | null;
};
/** One result from the "Find Missing Details" lookup — a value found for a currently-empty
 * extraction_institution_overview field, pending admin approval via save-and-learn. */
export type MissingDetailCandidate = {
  field: string;
  label: string;
  value: string;
  source_url: string | null;
};

/** Tables the backend's save-and-learn endpoint accepts a patch for. */
export type EditableTable =
  | "extraction_courses"
  | "extraction_institution_overview"
  | "extraction_campuses"
  | "extraction_agents"
  | "extraction_intakes"
  | "extraction_course_fees"
  | "extraction_eligibility_requirements"
  | "extraction_study_units"
  | "extraction_accreditations"
  | "extraction_study_options"
  | "extraction_visa_services";

// guided_urls values are URL arrays and resource objects, not strings — matches the
// backend's `z.record(z.unknown())`.
export type UpdateContextParams = { guided_urls?: Record<string, unknown> | null; guidance_notes?: string | null };

// ── Course-linked entity types ──────────────────────────────────

/** One installment of a fee. `lines` breaks it down by fee type; amount is their sum. */
export type FeeInstallment = {
  label: string;
  amount: number;
  lines?: { fee_type: string; amount: number }[];
};

export type CourseFee = ActorFields & {
  id: string;
  name: string | null;
  /** The source page's own fee wording — the label stays short, the detail lives here. */
  description: string | null;
  student_type: string | null;
  period_type: string | null;
  currency: string | null;
  total_amount: number | null;
  installments?: FeeInstallment[] | null;
  save_for_reuse?: boolean;
  created_at: string;
  updated_at?: string;
};

export type CourseFeeParams = {
  name?: string | null;
  description?: string | null;
  student_type?: string;
  period_type?: string;
  currency?: string;
  total_amount?: number;
  installments?: FeeInstallment[];
  save_for_reuse?: boolean;
  /** Courses to link on create. Junction write, not a column — never send it on a PATCH. */
  course_ids?: string[];
};
/**
 * One row of an intake's `custom_dates` jsonb — a date this intake carries beyond the four fixed
 * ones, named by the admin or extracted from a calendar page ("Exam Date", "Scholarship Deadline").
 *
 * `date` is a PARTIAL date: "2026-09-21" when the source gave a day, "2026-09" when it gave only a
 * month. The precision is the value's own shape (see utils/datePrecisionOf) rather than a separate
 * field, so the two can never disagree.
 */
export type IntakeCustomDate = {
  name: string;
  /** "YYYY-MM-DD" or "YYYY-MM" — never widened into a day the source didn't state. */
  date: string;
};

export type Intake = ActorFields & {
  id: string;
  intake_name: string | null;
  /**
   * The four fixed dates, each a PARTIAL date: "2026-09-21" or "2026-09". A university that
   * publishes "applications close in January 2027" has stated a month, and storing "2027-01-01"
   * for it is a deadline nobody set — which a student can then miss by weeks.
   */
  start_date: string | null;
  end_date: string | null;
  orientation_date: string | null;
  admission_deadline: string | null;
  intake_month: number | null;
  intake_year: number | null;
  /** Optional on the wire: rows created before the column existed read back as `[]`. */
  custom_dates?: IntakeCustomDate[] | null;
  created_at: string;
  updated_at?: string;
};

export type IntakeParams = {
  intake_name?: string;
  /** Partial dates, as Intake above. */
  start_date?: string;
  end_date?: string;
  orientation_date?: string;
  admission_deadline?: string;
  intake_month?: number;
  intake_year?: number;
  custom_dates?: IntakeCustomDate[];
};
/** One row of an eligibility requirement's language_tests / academic_tests jsonb. */
export type LanguageTest = {
  test_type_name: string;
  overall_score: string;
  listening_score?: string;
  reading_score?: string;
  writing_score?: string;
  speaking_score?: string;
};

export type AcademicTest = {
  test_name: string;
  /** A stated minimum the applicant must clear. */
  score: string;
  /** What admitted students scored (average/median/percentile) — context, never a bar. */
  typical_score?: string | null;
  is_optional?: boolean;
};

export type EligibilityRequirement = ActorFields & {
  id: string;
  name: string | null;
  applicable_to: string | null;
  min_degree_level: string | null;
  score_type: string | null;
  min_score: number | null;
  min_score_percent: number | null;
  description: string | null;
  language_tests?: LanguageTest[] | null;
  academic_tests?: AcademicTest[] | null;
  created_at: string;
  updated_at?: string;
};

export type EligibilityParams = {
  name?: string;
  applicable_to?: string;
  min_degree_level?: string | null;
  score_type?: string | null;
  min_score?: number | null;
  min_score_percent?: number | null;
  description?: string | null;
  language_tests?: LanguageTest[];
  academic_tests?: AcademicTest[];
};
export type StudyUnit = ActorFields & { id: string; unit_code: string | null; unit_name: string; credit_points: number | null; unit_type: string | null; description: string | null; created_at: string; updated_at?: string };

export type StudyUnitParams = {
  unit_name?: string;
  unit_code?: string | null;
  credit_points?: number | null;
  unit_type?: string | null;
  description?: string | null;
};
export type StudyOption = ActorFields & { id: string; name: string | null; study_mode: string | null; study_load: string | null; duration_value: number | null; duration_unit: string | null; applicable_to: string | null; save_for_reuse?: boolean; created_at: string; updated_at?: string };

// ── Visa services (source_type: "visa_service") ──────────────────

export type VisaServiceStatus = "pending" | "approved" | "discarded";

/** One row of extraction_visa_services — flat table, no child/junction entities. */
export type VisaService = ActorFields & {
  id: string;
  job_id: string;
  status: VisaServiceStatus | string;
  name: string;
  provider_name: string | null;
  type: string | null;
  description: string | null;
  registration_number: string | null;
  registration_body: string | null;
  registration_status: string | null;
  registration_level: string | null;
  visa_types_handled: string[] | null;
  services_offered: string[] | null;
  specializations: string[] | null;
  fee_amount: number | null;
  fee_currency: string | null;
  fee_type: string | null;
  consultation_fee: number | null;
  consultation_free: boolean | null;
  success_rate: number | null;
  cases_handled: number | null;
  years_experience: number | null;
  team_size: number | null;
  qualified_agents_count: number | null;
  countries_serviced: string[] | null;
  nationalities_serviced: string[] | null;
  languages_spoken: string[] | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  booking_url: string | null;
  average_rating: number | null;
  review_count: number | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type StudyOptionParams = {
  name?: string | null;
  study_mode?: string | null;
  study_load?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  applicable_to?: string | null;
  save_for_reuse?: boolean;
};
export type Accreditation = ActorFields & { id: string; name: string; issuing_organization: string | null; website: string | null; description: string | null; created_at: string; updated_at?: string };

/** One junction row: which scraped accreditation is on which course, and its library mapping. */
export type AccreditationAssignment = {
  extraction_accreditation_id: string | null;
  accreditation_id: string | null;
  course_id: string | null;
  course_name: string | null;
};

export type JobAccreditations = {
  scraped: Accreditation[];
  assignments: AccreditationAssignment[];
};

/** superadmin.accreditations — the global library scraped rows get mapped to. */
export type LibraryAccreditation = {
  id: string;
  name: string;
  issuing_organization: string | null;
  website: string | null;
  description: string | null;
  country: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LibraryAccreditationInput = {
  name: string;
  issuing_organization?: string | null;
  website?: string | null;
  description?: string | null;
};
