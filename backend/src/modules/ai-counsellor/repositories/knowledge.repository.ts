// RAG data layer — read-only queries against superadmin.extraction_* tables + user profile context.

import type { Knex } from "knex";
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

/** Per-keyword OR match — a joined-phrase ILIKE ('%data science canada%') never
 * hits real rows, so every multi-word query used to return zero results. */
function anyKeywordILike(columns: string[], query: string) {
  const words = query.split(/\s+/).filter(Boolean);
  return function (this: Knex.QueryBuilder) {
    for (const word of words) {
      for (const col of columns) this.orWhereILike(col, `%${word}%`);
    }
  };
}

/** extraction_jobs whose institution_url is on the given domain (embed-mode scope). */
export async function jobIdsByInstitutionDomain(domain: string): Promise<string[]> {
  const rows = await masterKnex(`${SA}.extraction_jobs`)
    .whereILike("institution_url", `%${domain}%`)
    .select("id");
  return rows.map((r: { id: string }) => r.id);
}

export async function searchCourses(opts: {
  query: string;
  country?: string;
  degreeLevel?: string;
  limit?: number;
  /** Restrict to these extraction_jobs ids (embed mode). Empty array = no results. */
  jobIds?: string[];
}): Promise<CourseResult[]> {
  if (opts.jobIds?.length === 0) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;

  // Rank by how many keywords hit the strong columns (name/subject), so a match
  // on every word beats a single stray word matched in a long description.
  const words = opts.query.split(/\s+/).filter(Boolean);
  const rankSql = words
    .map(() => "(CASE WHEN c.name ILIKE ? OR c.subject_area ILIKE ? OR i.country ILIKE ? THEN 1 ELSE 0 END)")
    .join(" + ");
  const rankBindings = words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);

  const courses = await masterKnex(`${SA}.extraction_courses as c`)
    .join(`${SA}.extraction_institution_overview as i`, "c.job_id", "i.job_id")
    .select(
      "c.id", "c.job_id", "c.name", "c.short_name", "c.degree_level",
      "c.subject_area", "c.duration_weeks", "c.study_mode", "c.description",
      "c.country_code", "c.source_url",
      "i.name as institution_name", "i.country as institution_country",
    )
    .where(anyKeywordILike(["c.name", "c.subject_area", "c.description"], opts.query))
    // Any course status is fine — the gate is the institution being published
    // (job exported, same definition as the search module).
    .whereRaw(
      `exists (select 1 from ${SA}.extraction_jobs ej where ej.id = c.job_id and ej.status = 'exported')`,
    )
    .orderByRaw(`${rankSql} DESC`, rankBindings)
    .modify((q) => {
      if (opts.country) q.whereILike("i.country", `%${opts.country}%`);
      if (opts.degreeLevel) q.whereILike("c.degree_level", `%${opts.degreeLevel}%`);
      if (opts.jobIds) q.whereIn("c.job_id", opts.jobIds);
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
  return masterKnex(`${SA}.extraction_institution_overview`)
    .select("id", "job_id", "name", "website", "phone", "email", "address", "city", "state", "country", "description", "logo_url")
    .where(anyKeywordILike(["name", "country", "description"], opts.query))
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
  return masterKnex(`${SA}.extraction_visas`)
    .select(
      "id", "country_code", "subclass_code", "visa_stream", "category", "name",
      "description", "duration_months", "is_permanent", "work_rights", "study_rights",
      "application_fee_amount", "application_fee_currency",
      "processing_time_min_days", "processing_time_max_days", "official_url",
    )
    .where(anyKeywordILike(["name", "visa_stream", "category", "country_code"], opts.query))
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
  return masterKnex(`${SA}.extraction_agents as a`)
    .leftJoin(`${SA}.extraction_agent_locations as loc`, "a.id", "loc.agent_id")
    .select(
      "a.id", "a.name", "a.country", "a.email", "a.phone", "a.website",
      "a.city", "a.state", "a.logo_url", "a.location_count",
    )
    .where(anyKeywordILike(["a.name", "a.country", "a.city"], opts.query))
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
  return masterKnex(`${SA}.extraction_mara_agents`)
    .select(
      "id", "marn", "agent_name", "business_name", "registration_status",
      "registration_date", "expiry_date", "email", "phone", "website",
      "practice_areas", "languages_spoken",
      "office_country", "office_state", "office_city",
    )
    .where(anyKeywordILike(["agent_name", "business_name", "marn"], opts.query))
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

// ── Curated knowledge (superadmin.ai_knowledge_*) — Phase 4 ──

export interface KnowledgeVisaResult {
  id: string;
  destination_country: string;
  visa_type: string;
  requirements: Record<string, unknown>;
  required_documents: string[] | null;
  processing_time_days: number | null;
  application_fee_usd: number | null;
  work_rights_hours: number | null;
  post_study_visa: string | null;
  common_rejections: string[] | null;
}

export interface KnowledgeFaqResult {
  id: string;
  question: string;
  answer: string;
}

export interface CountryGuideResult {
  id: string;
  country: string;
  education_system: string | null;
  popular_cities: string[] | null;
  cost_of_living_monthly_usd: Record<string, unknown> | null;
  culture_notes: string | null;
  student_life: string | null;
  climate: string | null;
}

export interface KnowledgeChunkResult {
  id: string;
  document_id: string;
  content: string;
  heading_path: string | null;
  page_number: number | null;
  similarity: number;
  title: string | null;
  url: string | null;
  file_name: string | null;
  source_type: "url" | "file";
  category_label: string;
  source_domain: string;
  trust_tier: "gov" | "verified_institution" | "other";
}

export async function searchKnowledgeVisas(opts: { query: string; limit?: number }): Promise<KnowledgeVisaResult[]> {
  return masterKnex(`${SA}.ai_knowledge_visa`)
    .select(
      "id", "destination_country", "visa_type", "requirements", "required_documents",
      "processing_time_days", "application_fee_usd", "work_rights_hours",
      "post_study_visa", "common_rejections",
    )
    .where("active", true)
    .where(anyKeywordILike(["destination_country", "visa_type", "post_study_visa"], opts.query))
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

export async function searchKnowledgeFaqs(opts: { query: string; limit?: number }): Promise<KnowledgeFaqResult[]> {
  return masterKnex(`${SA}.ai_knowledge_faqs`)
    .select("id", "question", "answer")
    .where("active", true)
    .where(anyKeywordILike(["question", "answer"], opts.query))
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

export async function searchCountryGuides(opts: { query: string; limit?: number }): Promise<CountryGuideResult[]> {
  return masterKnex(`${SA}.ai_knowledge_country_guides`)
    .select(
      "id", "country", "education_system", "popular_cities",
      "cost_of_living_monthly_usd", "culture_notes", "student_life", "climate",
    )
    .where("active", true)
    .where(anyKeywordILike(["country"], opts.query))
    .limit(opts.limit ?? DEFAULT_LIMIT);
}

/** Semantic search over the Knowledge Rack via the migration's match function.
 * countryCode (ISO2) narrows to that country's categories; global categories always match. */
/**
 * Chunk-level retrieval — the primary path since Phase 6. A section-sized chunk
 * matches the question far better than a whole-page vector, and the full chunk
 * fits in the prompt where a whole page had to be truncated.
 */
export async function matchKnowledgeChunks(
  embedding: number[],
  count = 8,
  countryCode?: string | null,
): Promise<KnowledgeChunkResult[]> {
  const { rows } = await masterKnex.raw(
    `SELECT * FROM ${SA}.match_ai_knowledge_chunks(?::vector, ?, NULL, ?)`,
    [`[${embedding.join(",")}]`, count, countryCode ?? null],
  );
  return rows as KnowledgeChunkResult[];
}

/** Country names + ISO2 codes, for detecting a country mention in the user's query. */
export async function listCountryNames(): Promise<Array<{ name: string; iso2: string }>> {
  return masterKnex("countries")
    .select("name", "iso2")
    .where("is_active", true)
    .whereNull("deleted_at");
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
