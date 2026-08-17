// RAG data layer — read-only queries against superadmin.extraction_* tables + user profile context.

import { masterKnex } from "../../../core/db/master-pool.js";

// ── Result interfaces ──

export interface CourseResult {
  id: string;
  job_id: string;
  name: string;
  short_name: string | null;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  description: string | null;
  country_code: string | null;
  source_url: string | null;
  institution_name: string | null;
  institution_country: string | null;
  fees: FeeResult[];
  study_options: StudyOptionResult[];
}

export interface FeeResult {
  id: string;
  name: string | null;
  student_type: string;
  period_type: string | null;
  currency: string;
  total_amount: number;
}

export interface StudyOptionResult {
  id: string;
  study_mode: string;
  study_load: string;
  duration_value: number | null;
  duration_unit: string | null;
  applicable_to: string;
  name: string | null;
}

export interface InstitutionResult {
  id: string;
  job_id: string;
  name: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  logo_url: string | null;
}

export interface VisaResult {
  id: string;
  country_code: string | null;
  subclass_code: string | null;
  visa_stream: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  duration_months: number | null;
  is_permanent: boolean | null;
  work_rights: unknown;
  study_rights: unknown;
  application_fee_amount: number | null;
  application_fee_currency: string | null;
  processing_time_min_days: number | null;
  processing_time_max_days: number | null;
  official_url: string | null;
}

export interface AgentResult {
  id: string;
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  location_count: number;
}

export interface MaraAgentResult {
  id: string;
  marn: string;
  agent_name: string | null;
  business_name: string | null;
  registration_status: string | null;
  registration_date: string | null;
  expiry_date: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  practice_areas: string[] | null;
  languages_spoken: string[] | null;
  office_country: string | null;
  office_state: string | null;
  office_city: string | null;
}

export interface EligibilityResult {
  id: string;
  name: string | null;
  applicable_to: string;
  min_degree_level: string | null;
  min_score_percent: number | null;
  min_score_grade: string | null;
  description: string | null;
  score_type: string | null;
  min_score: number | null;
}

export interface EnglishRequirementResult {
  id: string;
  test_type_name: string | null;
  test_type: number | null;
  overall_score: string | null;
  listening_score: string | null;
  reading_score: string | null;
  writing_score: string | null;
  speaking_score: string | null;
}

export interface IntakeResult {
  id: string;
  intake_name: string | null;
  start_date: string | null;
  end_date: string | null;
  orientation_date: string | null;
  admission_deadline: string | null;
  intake_month: number | null;
  intake_year: number | null;
}

export interface CampusResult {
  id: string;
  campus_name: string | null;
  campus_id: string | null;
}

export interface StudyUnitResult {
  id: string;
  unit_code: string | null;
  unit_name: string;
  credit_points: number | null;
  description: string | null;
  unit_type: string;
}

export interface AccreditationResult {
  id: string;
  name: string;
  issuing_organization: string | null;
  website: string | null;
  description: string | null;
}

export interface CourseDetailResult {
  id: string;
  job_id: string;
  name: string;
  short_name: string | null;
  degree_level: string | null;
  degree_level_code: string | null;
  subject_area: string | null;
  subject_area_code: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  description: string | null;
  domestic_fee_total: number | null;
  international_fee_total: number | null;
  country_code: string | null;
  source_url: string | null;
  career_paths: string[] | null;
  institution_name: string | null;
  institution_country: string | null;
  fees: FeeResult[];
  eligibility: EligibilityResult[];
  english_requirements: EnglishRequirementResult[];
  intakes: IntakeResult[];
  study_options: StudyOptionResult[];
  campuses: CampusResult[];
  study_units: StudyUnitResult[];
  accreditations: AccreditationResult[];
}

export interface ProfileContext {
  profile: {
    nationality: string | null;
    country_of_residence: string | null;
    city_of_residence: string | null;
    date_of_birth: string | null;
    gender: string | null;
    degree_level: string | null;
    individual_category: string | null;
    preferred_destinations: unknown;
    fields_of_study: unknown;
    budget_min: number | null;
    budget_max: number | null;
    budget_currency: string | null;
    expected_start_date: string | null;
  } | null;
  qualifications: {
    qualification_type: string | null;
    degree_title: string | null;
    subject_area: string | null;
    institution_name: string | null;
    grading_system: string | null;
    grade_value: string | null;
    is_current: boolean;
    start_date: string | null;
    end_date: string | null;
  }[];
  language_tests: {
    test_status: string | null;
    test_type: string | null;
    overall_score: string | null;
    test_date: string | null;
    sub_scores: unknown;
  }[];
  work_experiences: {
    job_title: string;
    organization_name: string | null;
    is_current: boolean;
    start_date: string | null;
    end_date: string | null;
  }[];
}

// ── Search queries ──

const SA = "superadmin"; // schema prefix
const DEFAULT_LIMIT = 10;

export async function searchCourses(opts: {
  query: string;
  country?: string;
  degreeLevel?: string;
  limit?: number;
}): Promise<CourseResult[]> {
  const like = `%${opts.query}%`;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const courses = await masterKnex(`${SA}.extraction_courses as c`)
    .join(`${SA}.extraction_institution_overview as i`, "c.job_id", "i.job_id")
    .select(
      "c.id", "c.job_id", "c.name", "c.short_name", "c.degree_level",
      "c.subject_area", "c.duration_weeks", "c.study_mode", "c.description",
      "c.country_code", "c.source_url",
      "i.name as institution_name", "i.country as institution_country",
    )
    .where(function () {
      this.whereILike("c.name", like)
        .orWhereILike("c.subject_area", like)
        .orWhereILike("c.description", like);
    })
    .modify((q) => {
      if (opts.country) q.whereILike("i.country", `%${opts.country}%`);
      if (opts.degreeLevel) q.whereILike("c.degree_level", `%${opts.degreeLevel}%`);
    })
    .limit(limit);

  // Batch-load fees and study options for returned courses
  const courseIds = courses.map((c: { id: string }) => c.id);
  if (courseIds.length === 0) return [];

  const [fees, studyOptions] = await Promise.all([
    masterKnex(`${SA}.extraction_course_fee_assignments as cfa`)
      .join(`${SA}.extraction_course_fees as f`, "cfa.course_fee_id", "f.id")
      .whereIn("cfa.course_id", courseIds)
      .select("cfa.course_id", "f.id", "f.name", "f.student_type", "f.period_type", "f.currency", "f.total_amount"),
    masterKnex(`${SA}.extraction_course_study_option_assignments as csoa`)
      .join(`${SA}.extraction_study_options as so`, "csoa.study_option_id", "so.id")
      .whereIn("csoa.course_id", courseIds)
      .select("csoa.course_id", "so.id", "so.study_mode", "so.study_load", "so.duration_value", "so.duration_unit", "so.applicable_to", "so.name"),
  ]);

  const feesByCourse = groupBy(fees, "course_id");
  const optsByCourse = groupBy(studyOptions, "course_id");

  return courses.map((c: Record<string, unknown>) => ({
    ...c,
    fees: (feesByCourse[c.id as string] ?? []).map(stripCourseId),
    study_options: (optsByCourse[c.id as string] ?? []).map(stripCourseId),
  })) as CourseResult[];
}

export async function searchInstitutions(opts: {
  query: string;
  country?: string;
  limit?: number;
}): Promise<InstitutionResult[]> {
  const like = `%${opts.query}%`;
  return masterKnex(`${SA}.extraction_institution_overview`)
    .select("id", "job_id", "name", "website", "phone", "email", "address", "city", "state", "country", "description", "logo_url")
    .where(function () {
      this.whereILike("name", like)
        .orWhereILike("country", like)
        .orWhereILike("description", like);
    })
    .modify((q) => {
      if (opts.country) q.whereILike("country", `%${opts.country}%`);
    })
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

export async function searchVisas(opts: {
  query: string;
  country?: string;
  limit?: number;
}): Promise<VisaResult[]> {
  const like = `%${opts.query}%`;
  return masterKnex(`${SA}.extraction_visas`)
    .select(
      "id", "country_code", "subclass_code", "visa_stream", "category", "name",
      "description", "duration_months", "is_permanent", "work_rights", "study_rights",
      "application_fee_amount", "application_fee_currency",
      "processing_time_min_days", "processing_time_max_days", "official_url",
    )
    .where(function () {
      this.whereILike("name", like)
        .orWhereILike("visa_stream", like)
        .orWhereILike("category", like)
        .orWhereILike("country_code", like);
    })
    .modify((q) => {
      if (opts.country) q.whereILike("country_code", `%${opts.country}%`);
    })
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

export async function searchAgents(opts: {
  query: string;
  country?: string;
  limit?: number;
}): Promise<AgentResult[]> {
  const like = `%${opts.query}%`;
  return masterKnex(`${SA}.extraction_agents as a`)
    .leftJoin(`${SA}.extraction_agent_locations as loc`, "a.id", "loc.agent_id")
    .select(
      "a.id", "a.name", "a.country", "a.email", "a.phone", "a.website",
      "a.city", "a.state", "a.logo_url", "a.location_count",
    )
    .where(function () {
      this.whereILike("a.name", like)
        .orWhereILike("a.country", like)
        .orWhereILike("a.city", like);
    })
    .modify((q) => {
      if (opts.country) q.whereILike("a.country", `%${opts.country}%`);
    })
    .groupBy("a.id")
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

export async function searchMaraAgents(opts: {
  query: string;
  limit?: number;
}): Promise<MaraAgentResult[]> {
  const like = `%${opts.query}%`;
  return masterKnex(`${SA}.extraction_mara_agents`)
    .select(
      "id", "marn", "agent_name", "business_name", "registration_status",
      "registration_date", "expiry_date", "email", "phone", "website",
      "practice_areas", "languages_spoken",
      "office_country", "office_state", "office_city",
    )
    .where(function () {
      this.whereILike("agent_name", like)
        .orWhereILike("business_name", like)
        .orWhereILike("marn", like);
    })
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

// ── Course detail (single course with all related data) ──

export async function getCourseDetails(courseId: string): Promise<CourseDetailResult | undefined> {
  const course = await masterKnex(`${SA}.extraction_courses as c`)
    .join(`${SA}.extraction_institution_overview as i`, "c.job_id", "i.job_id")
    .select(
      "c.id", "c.job_id", "c.name", "c.short_name", "c.degree_level", "c.degree_level_code",
      "c.subject_area", "c.subject_area_code", "c.duration_weeks", "c.study_mode",
      "c.description", "c.domestic_fee_total", "c.international_fee_total",
      "c.country_code", "c.source_url", "c.career_paths",
      "i.name as institution_name", "i.country as institution_country",
    )
    .where("c.id", courseId)
    .first();

  if (!course) return undefined;

  const [fees, eligibility, englishReqs, intakes, studyOptions, campuses, studyUnits, accreditations] =
    await Promise.all([
      masterKnex(`${SA}.extraction_course_fee_assignments as cfa`)
        .join(`${SA}.extraction_course_fees as f`, "cfa.course_fee_id", "f.id")
        .where("cfa.course_id", courseId)
        .select("f.id", "f.name", "f.student_type", "f.period_type", "f.currency", "f.total_amount"),

      masterKnex(`${SA}.extraction_course_eligibility_assignments as cea`)
        .join(`${SA}.extraction_eligibility_requirements as e`, "cea.eligibility_requirement_id", "e.id")
        .where("cea.course_id", courseId)
        .select("e.id", "e.name", "e.applicable_to", "e.min_degree_level", "e.min_score_percent", "e.min_score_grade", "e.description", "e.score_type", "e.min_score"),

      masterKnex(`${SA}.extraction_english_requirements`)
        .where("course_id", courseId)
        .select("id", "test_type_name", "test_type", "overall_score", "listening_score", "reading_score", "writing_score", "speaking_score"),

      masterKnex(`${SA}.extraction_course_intake_assignments as cia`)
        .join(`${SA}.extraction_intakes as ik`, "cia.intake_id", "ik.id")
        .where("cia.course_id", courseId)
        .select("ik.id", "ik.intake_name", "ik.start_date", "ik.end_date", "ik.orientation_date", "ik.admission_deadline", "ik.intake_month", "ik.intake_year"),

      masterKnex(`${SA}.extraction_course_study_option_assignments as csoa`)
        .join(`${SA}.extraction_study_options as so`, "csoa.study_option_id", "so.id")
        .where("csoa.course_id", courseId)
        .select("so.id", "so.study_mode", "so.study_load", "so.duration_value", "so.duration_unit", "so.applicable_to", "so.name"),

      masterKnex(`${SA}.extraction_course_campuses`)
        .where("course_id", courseId)
        .select("id", "campus_name", "campus_id"),

      masterKnex(`${SA}.extraction_course_study_unit_assignments as csua`)
        .join(`${SA}.extraction_study_units as su`, "csua.study_unit_id", "su.id")
        .where("csua.course_id", courseId)
        .select("su.id", "su.unit_code", "su.unit_name", "su.credit_points", "su.description", "su.unit_type"),

      masterKnex(`${SA}.extraction_course_accreditation_assignments as caa`)
        .join(`${SA}.extraction_accreditations as acc`, "caa.extraction_accreditation_id", "acc.id")
        .where("caa.course_id", courseId)
        .select("acc.id", "acc.name", "acc.issuing_organization", "acc.website", "acc.description"),
    ]);

  return {
    ...course,
    fees,
    eligibility,
    english_requirements: englishReqs,
    intakes,
    study_options: studyOptions,
    campuses,
    study_units: studyUnits,
    accreditations,
  } as CourseDetailResult;
}

// ── User profile context (globalyapp tables, no schema prefix) ──

export async function getProfileContext(userId: number): Promise<ProfileContext> {
  const [profileRow, qualifications, languageTests, workExperiences] = await Promise.all([
    masterKnex("platform_user_profiles as p")
      .leftJoin("countries as nat", "p.nationality_id", "nat.id")
      .leftJoin("countries as res", "p.country_of_residence_id", "res.id")
      .where("p.user_id", userId)
      .whereNull("p.deleted_at")
      .select(
        "nat.name as nationality",
        "res.name as country_of_residence",
        "p.city_of_residence", "p.date_of_birth", "p.gender", "p.degree_level",
        "p.individual_category", "p.preferred_destinations", "p.fields_of_study",
        "p.budget_min", "p.budget_max", "p.budget_currency", "p.expected_start_date",
      )
      .first(),

    masterKnex("platform_user_qualifications")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("qualification_type", "degree_title", "subject_area", "institution_name", "grading_system", "grade_value", "is_current", "start_date", "end_date")
      .orderBy("sort_order"),

    masterKnex("platform_user_language_tests")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("test_status", "test_type", "overall_score", "test_date", "sub_scores")
      .orderBy("sort_order"),

    masterKnex("platform_user_work_experiences")
      .where({ user_id: userId })
      .whereNull("deleted_at")
      .select("job_title", "organization_name", "is_current", "start_date", "end_date")
      .orderBy("sort_order"),
  ]);

  return {
    profile: profileRow ?? null,
    qualifications,
    language_tests: languageTests,
    work_experiences: workExperiences,
  };
}

// ── Helpers ──

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const row of rows) {
    const k = row[key] as string;
    (map[k] ??= []).push(row);
  }
  return map;
}

function stripCourseId<T extends Record<string, unknown>>(row: T): Omit<T, "course_id"> {
  const { course_id: _, ...rest } = row;
  return rest as Omit<T, "course_id">;
}
