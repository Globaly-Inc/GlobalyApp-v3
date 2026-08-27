// Writes LLM-extracted data to the staging tables with proper relationships.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("staging-writer");

// ── Types matching LLM output ──

export interface ExtractedCourse {
  name: string;
  short_name?: string | null;
  degree_level?: string | null;
  /** LLM-classified per course, not inherited from the job's service_category_id — a job
   * scoped to "Academic Courses" still surfaces short courses on the same pages. */
  course_category?: string | null;
  subject_area?: string | null;
  duration_weeks?: number | null;
  study_mode?: string | null;
  description?: string | null;
  awarding_institution?: string | null;
  source_url?: string | null;
  career_paths?: string[] | null;
  fees?: ExtractedFee[];
  intakes?: ExtractedIntake[];
  study_options?: ExtractedStudyOption[];
  eligibility?: ExtractedEligibility[];
  english_requirements?: ExtractedEnglishReq[];
  campus_names?: string[];
  study_units?: ExtractedStudyUnit[];
  /** LLM-flagged link to this course's own curriculum page — routing only, not persisted. */
  curriculum_page_url?: string | null;
}

export interface ExtractedStudyUnit {
  unit_code?: string | null;
  unit_name: string;
  credit_points?: number | null;
}

export interface ExtractedFee {
  name?: string | null;
  student_type?: string;
  period_type?: string;
  currency?: string | null;
  /** LLM output isn't schema-enforced (responseMimeType: json only) — often a plain number, but a
   * range ("$25,000-$30,000") or unparseable text ("Contact us") arrives as a string. */
  total_amount?: number | string | null;
}

export interface ExtractedIntake {
  intake_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  intake_month?: number | string | null;
  intake_year?: number | string | null;
  admission_deadline?: string | null;
}

// ponytail: LLM sometimes returns "September" instead of 9
const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function coerceMonth(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v >= 1 && v <= 12 ? v : null;
  const s = String(v).trim().toLowerCase();
  const n = Number(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  return MONTH_NAMES[s] ?? null;
}

// ponytail: LLM emits "February 15" / "Feb 2026" for date columns — ISO or null, nothing else.
// A string with no year ("February 15") is not a date; the month still survives via intake_month.
function coerceDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  if (!/\d{4}/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Local date parts, not toISOString(): non-ISO strings parse as local midnight,
  // and the UTC rendering shifts them a day in any timezone ahead of UTC.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.floor(n);
}

// ponytail: takes the lower bound of a range/currency-symbol string ("$25,000-$30,000" -> 25000);
// the full original text still survives in the fee's own name. Doesn't handle "25k"-style shorthand
// — add that if a real page needs it. Never falls back to 0: an unparseable fee must stay null, not
// look like a real $0 tuition figure.
/** LLM output isn't schema-enforced — clamp free-text drift ("Academic", "Short Course") to
 * the two values the pipeline actually stores/filters on; anything unrecognised is left null
 * rather than guessed. */
export function normaliseCourseCategory(v: unknown): "academic" | "short_course" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "academic") return "academic";
  if (s === "short_course" || s === "short_courses") return "short_course";
  return null;
}

export function coerceMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const match = String(v).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export interface ExtractedStudyOption {
  name?: string | null;
  study_mode?: string;
  study_load?: string;
  duration_value?: number | null;
  duration_unit?: string;
}

export interface ExtractedEligibility {
  name?: string | null;
  applicable_to?: string;
  description?: string | null;
  min_score_percent?: number | null;
  min_degree_level?: string | null;
}

export interface ExtractedEnglishReq {
  test_type_name?: string | null;
  overall_score?: string | null;
  listening_score?: string | null;
  reading_score?: string | null;
  writing_score?: string | null;
  speaking_score?: string | null;
}

export interface ExtractedCampus {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface InstitutionOverview {
  name?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
  logo_url?: string | null;
  source_url?: string | null;
  zip_code?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  youtube_url?: string | null;
}

export interface SiteIntelligence {
  institution_name?: string | null;
  institution_type?: string | null;
  country?: string | null;
  currency?: string | null;
  fee_structure?: Record<string, unknown>;
  extraction_hints?: string[];
  navigation_patterns?: Record<string, unknown>;
}

// ── Writers ──

export async function writeInstitutionOverview(jobId: string, data: InstitutionOverview) {
  const [row] = await masterKnex(`${S}.extraction_institution_overview`)
    .insert({ job_id: jobId, ...data })
    .returning("id");
  logger.info("Wrote institution overview", { jobId, id: row.id });
  return row;
}

export async function writeSiteIntelligence(jobId: string, data: SiteIntelligence) {
  const insert: Record<string, unknown> = {
    job_id: jobId,
    institution_name: data.institution_name,
    institution_type: data.institution_type,
    country: data.country,
    currency: data.currency,
  };
  if (data.fee_structure) insert.fee_structure = JSON.stringify(data.fee_structure);
  if (data.extraction_hints) insert.extraction_hints = data.extraction_hints;
  if (data.navigation_patterns) insert.navigation_patterns = JSON.stringify(data.navigation_patterns);

  const [row] = await masterKnex(`${S}.extraction_site_intelligence`).insert(insert).returning("id");
  logger.info("Wrote site intelligence", { jobId, id: row.id });
  return row;
}

// ponytail: LLM returns "Sydney", "Sydney Campus", "sydney" — normalize to match
export function normaliseCampusName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s+campus$/i, "")
    .replace(/\s+/g, " ");
}

/**
 * Upsert a campus for a job — deduplicates by normalised name within the same job.
 */
export async function upsertCampus(jobId: string, campus: ExtractedCampus): Promise<string> {
  if (!campus.name) return "";

  const allCampuses = await masterKnex(`${S}.extraction_campuses`)
    .where({ job_id: jobId });

  const norm = normaliseCampusName(campus.name);
  const existing = allCampuses.find(c => normaliseCampusName(c.name) === norm);

  if (existing) return existing.id;

  const [row] = await masterKnex(`${S}.extraction_campuses`)
    .insert({ job_id: jobId, ...campus })
    .returning("id");
  return row.id;
}

// ponytail: same shape as normaliseCampusName — LLM re-extracts the same unit with
// slightly different casing/whitespace across course pages and job re-runs
export function normaliseUnitName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Upsert a study unit for a job — deduplicates by normalised unit_name within the same
 * job, mirroring upsertCampus. Without this, every course extraction (including re-runs)
 * inserted a fresh extraction_study_units row for the same unit shared across courses.
 */
export async function upsertStudyUnit(jobId: string, unit: ExtractedStudyUnit): Promise<string> {
  const norm = normaliseUnitName(unit.unit_name);
  const existing = await masterKnex(`${S}.extraction_study_units`)
    .where({ job_id: jobId })
    .whereRaw("LOWER(TRIM(unit_name)) = ?", [norm])
    .first();
  if (existing) return existing.id;

  const [row] = await masterKnex(`${S}.extraction_study_units`)
    .insert({
      job_id: jobId,
      unit_code: unit.unit_code ?? null,
      unit_name: unit.unit_name,
      credit_points: coerceInt(unit.credit_points),
    })
    .returning("id");
  return row.id;
}

/**
 * Normalise a course name for dedup: lowercase, collapse whitespace, strip degree
 * prefixes that the LLM sometimes includes inconsistently.
 */
export function normaliseCourseName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s+/g, " ")
    // "Bachelor of Science in Computer Science" and "Computer Science (Bachelor)" should NOT dedup —
    // but "Bachelor of Computer Science" on two different pages should. Strip only trailing junk.
    .replace(/[^a-z0-9]+$/g, "");
}

/**
 * Write a full course with all its child entities and junction assignments.
 * Deduplicates by normalised name within the same job — if a course already exists,
 * merges richer data into the existing row and attaches new child entities.
 * Returns the course ID.
 */
export async function writeCourse(jobId: string, course: ExtractedCourse, campusIdMap: Map<string, string>): Promise<string> {
  // ── Dedup: check if this course name already exists for this job ──
  const normName = normaliseCourseName(course.name);
  const existing = await masterKnex(`${S}.extraction_courses`)
    .where({ job_id: jobId })
    .whereRaw("LOWER(TRIM(name)) = ?", [normName])
    .first();

  let courseId: string;

  if (existing) {
    courseId = existing.id;
    // Merge: fill nulls on the existing row with data from this extraction
    const updates: Record<string, unknown> = {};
    const mergeFields: Array<keyof ExtractedCourse> = [
      "short_name", "degree_level", "course_category", "subject_area", "duration_weeks",
      "study_mode", "description", "awarding_institution",
      "source_url",
    ];
    for (const field of mergeFields) {
      const newVal = field === "duration_weeks" ? coerceInt(course[field])
        : field === "course_category" ? normaliseCourseCategory(course[field])
        : (course[field] ?? null);
      if (newVal != null && newVal !== "" && (existing[field] == null || existing[field] === "")) {
        updates[field] = newVal;
      }
    }
    if (course.career_paths?.length && (!existing.career_paths || existing.career_paths.length === 0)) {
      updates.career_paths = course.career_paths;
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_courses`).where({ id: courseId }).update(updates);
      logger.info("Merged duplicate course", { jobId, courseId, name: course.name, fieldsUpdated: Object.keys(updates).length - 1 });
    } else {
      logger.info("Skipped duplicate course (no new data)", { jobId, courseId, name: course.name });
    }
  } else {
    // ── Insert new course ──
    const courseInsert: Record<string, unknown> = {
      job_id: jobId,
      name: course.name,
      short_name: course.short_name ?? null,
      degree_level: course.degree_level ?? null,
      course_category: normaliseCourseCategory(course.course_category),
      subject_area: course.subject_area ?? null,
      duration_weeks: coerceInt(course.duration_weeks),
      study_mode: course.study_mode ?? null,
      description: course.description ?? null,
      awarding_institution: course.awarding_institution ?? null,
      source_url: course.source_url ?? null,
      verification_status: "unverified",
    };
    if (course.career_paths?.length) courseInsert.career_paths = course.career_paths;

    const [courseRow] = await masterKnex(`${S}.extraction_courses`).insert(courseInsert).returning("id");
    courseId = courseRow.id;
  }

  // ── Fees + assignments ──
  if (course.fees?.length) {
    for (const fee of course.fees) {
      const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
        .insert({
          job_id: jobId,
          name: fee.name ?? null,
          student_type: fee.student_type ?? "both",
          period_type: fee.period_type ?? "Per Year",
          currency: fee.currency ?? null,
          total_amount: coerceMoney(fee.total_amount),
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_fee_assignments`)
        .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeRow.id })
        .onConflict(["course_id", "course_fee_id"]).ignore();
    }
  }

  // ── Intakes + assignments ──
  if (course.intakes?.length) {
    for (const intake of course.intakes) {
      const [intakeRow] = await masterKnex(`${S}.extraction_intakes`)
        .insert({
          job_id: jobId,
          course_id: courseId,
          intake_name: intake.intake_name ?? null,
          start_date: coerceDate(intake.start_date),
          end_date: coerceDate(intake.end_date),
          intake_month: coerceMonth(intake.intake_month),
          intake_year: coerceInt(intake.intake_year),
          admission_deadline: coerceDate(intake.admission_deadline),
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_intake_assignments`)
        .insert({ job_id: jobId, course_id: courseId, intake_id: intakeRow.id })
        .onConflict(["course_id", "intake_id"]).ignore();
    }
  }

  // ── Study options + assignments ──
  if (course.study_options?.length) {
    for (const opt of course.study_options) {
      const [optRow] = await masterKnex(`${S}.extraction_study_options`)
        .insert({
          job_id: jobId,
          name: opt.name ?? null,
          study_mode: opt.study_mode ?? "on_campus",
          study_load: opt.study_load ?? "full_time",
          duration_value: coerceInt(opt.duration_value),
          duration_unit: opt.duration_unit ?? "months",
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_study_option_assignments`)
        .insert({ job_id: jobId, course_id: courseId, study_option_id: optRow.id })
        .onConflict(["course_id", "study_option_id"]).ignore();
    }
  }

  // ── Eligibility requirements + assignments ──
  if (course.eligibility?.length) {
    for (const elig of course.eligibility) {
      const [eligRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
        .insert({
          job_id: jobId,
          name: elig.name ?? null,
          applicable_to: elig.applicable_to ?? "both",
          description: elig.description ?? null,
          min_score_percent: coerceInt(elig.min_score_percent),
          min_degree_level: elig.min_degree_level ?? null,
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_eligibility_assignments`)
        .insert({ job_id: jobId, course_id: courseId, eligibility_requirement_id: eligRow.id })
        .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
    }
  }

  // ── English requirements ──
  if (course.english_requirements?.length) {
    for (const eng of course.english_requirements) {
      await masterKnex(`${S}.extraction_english_requirements`).insert({
        job_id: jobId,
        course_id: courseId,
        test_type_name: eng.test_type_name ?? null,
        overall_score: eng.overall_score ?? null,
        listening_score: eng.listening_score ?? null,
        reading_score: eng.reading_score ?? null,
        writing_score: eng.writing_score ?? null,
        speaking_score: eng.speaking_score ?? null,
      });
    }
  }

  // ── Study units + assignments ──
  if (course.study_units?.length) {
    for (const unit of course.study_units) {
      if (!unit.unit_name) continue;
      const unitId = await upsertStudyUnit(jobId, unit);
      await masterKnex(`${S}.extraction_course_study_unit_assignments`)
        .insert({ job_id: jobId, course_id: courseId, study_unit_id: unitId })
        .onConflict(["course_id", "study_unit_id"]).ignore();
    }
  }

  // ── Campus links ──
  if (course.campus_names?.length) {
    for (const campusName of course.campus_names) {
      const campusId = campusIdMap.get(normaliseCampusName(campusName));
      if (campusId) {
        await masterKnex(`${S}.extraction_course_campuses`)
          .insert({ job_id: jobId, course_id: courseId, campus_id: campusId, campus_name: campusName })
          .onConflict().ignore(); // no unique constraint here, but safe
      }
    }
  }

  logger.info("Wrote course", { jobId, courseId, name: course.name });
  return courseId;
}

/**
 * Replace all campuses for a job — delete existing + re-insert.
 * Re-links course-campus junctions by matching normalised campus names.
 * Returns a map of normalised name → new campus ID.
 */
export async function replaceCampuses(
  jobId: string,
  campuses: ExtractedCampus[],
): Promise<Map<string, string>> {
  // Load existing junctions before deleting campuses
  const existingJunctions = await masterKnex(`${S}.extraction_course_campuses`)
    .where({ job_id: jobId })
    .select("course_id", "campus_id", "campus_name");

  // Build old-id → name map from existing campuses
  const oldCampuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId });
  const oldIdToName = new Map<string, string>();
  for (const c of oldCampuses) {
    oldIdToName.set(c.id, normaliseCampusName(c.name));
  }

  // Delete existing campuses (cascade deletes junctions via DB or we re-create)
  await masterKnex(`${S}.extraction_course_campuses`).where({ job_id: jobId }).delete();
  await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).delete();

  // Insert new campuses, dedup by normalised name
  const idMap = new Map<string, string>();
  for (const campus of campuses) {
    if (!campus.name) continue;
    const norm = normaliseCampusName(campus.name);
    if (idMap.has(norm)) continue;
    const [row] = await masterKnex(`${S}.extraction_campuses`)
      .insert({ job_id: jobId, ...campus })
      .returning("id");
    idMap.set(norm, row.id);
  }

  // Re-link junctions by matching normalised campus name
  for (const junc of existingJunctions) {
    const oldNorm = junc.campus_name
      ? normaliseCampusName(junc.campus_name)
      : oldIdToName.get(junc.campus_id) ?? "";
    const newCampusId = idMap.get(oldNorm);
    if (newCampusId) {
      await masterKnex(`${S}.extraction_course_campuses`)
        .insert({
          job_id: jobId,
          course_id: junc.course_id,
          campus_id: newCampusId,
          campus_name: junc.campus_name,
        })
        .onConflict().ignore();
    }
  }

  logger.info("Replaced campuses", { jobId, count: idMap.size });
  return idMap;
}

/**
 * Upsert an agent by (job_id, external_id).
 * Returns the agent row ID.
 */
export async function upsertAgent(
  jobId: string,
  agent: Record<string, unknown>,
  externalId: string,
): Promise<string> {
  const existing = await masterKnex(`${S}.extraction_agents`)
    .where({ job_id: jobId, external_id: externalId })
    .first();

  if (existing) {
    // Merge: only overwrite nulls
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(agent)) {
      if (key === "job_id" || key === "external_id" || key === "id") continue;
      if (val != null && val !== "" && (existing[key] == null || existing[key] === "")) {
        updates[key] = val;
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_agents`).where({ id: existing.id }).update(updates);
    }
    return existing.id;
  }

  const [row] = await masterKnex(`${S}.extraction_agents`)
    .insert({ job_id: jobId, external_id: externalId, ...agent })
    .returning("id");
  return row.id;
}

/**
 * Insert agent locations for an agent within a job.
 * Deletes existing locations for the agent first to allow re-runs.
 */
export async function writeAgentLocations(
  agentId: string,
  jobId: string,
  locations: Array<Record<string, unknown>>,
): Promise<void> {
  await masterKnex(`${S}.extraction_agent_locations`)
    .where({ agent_id: agentId, job_id: jobId })
    .delete();

  if (locations.length === 0) return;

  const rows = locations.map((loc) => ({
    agent_id: agentId,
    job_id: jobId,
    ...loc,
  }));
  await masterKnex(`${S}.extraction_agent_locations`).insert(rows);
}

// ── Visa services (source_type: "visa_service") ──

export interface ExtractedVisaService {
  name: string;
  provider_name?: string | null;
  type?: string | null;
  description?: string | null;
  registration_number?: string | null;
  registration_body?: string | null;
  registration_status?: string | null;
  registration_level?: string | null;
  visa_types_handled?: string[] | null;
  services_offered?: string[] | null;
  specializations?: string[] | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  fee_type?: string | null;
  fee_from?: number | null;
  fee_to?: number | null;
  consultation_fee?: number | null;
  consultation_free?: boolean | null;
  success_rate?: number | null;
  cases_handled?: number | null;
  years_experience?: number | null;
  team_size?: number | null;
  qualified_agents_count?: number | null;
  countries_serviced?: string[] | null;
  nationalities_serviced?: string[] | null;
  languages_spoken?: string[] | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  booking_url?: string | null;
  average_rating?: number | null;
  review_count?: number | null;
  source_url?: string | null;
}

// ponytail: same shape as normaliseCourseName/normaliseUnitName — dedup key for re-runs
// and services mentioned on more than one page of the same site.
export function normaliseVisaServiceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// text[] columns — knex/pg serialize a plain JS array correctly on its own.
const VISA_SERVICE_ARRAY_FIELDS: Array<keyof ExtractedVisaService> = [
  "visa_types_handled", "specializations",
  "countries_serviced", "nationalities_serviced", "languages_spoken",
];

// services_offered is jsonb, not text[] (see 20260812_004_extraction_visa_services.ts) — a
// plain JS array needs JSON.stringify first, same as writeSiteIntelligence's fee_structure.
// Passing it through the text[] path threw "invalid input syntax for type json".
const VISA_SERVICE_JSON_ARRAY_FIELDS: Array<keyof ExtractedVisaService> = ["services_offered"];

// Plain text/boolean columns — pass through as-is.
const VISA_SERVICE_SCALAR_FIELDS: Array<keyof ExtractedVisaService> = [
  "provider_name", "type", "description", "registration_number", "registration_body",
  "registration_status", "registration_level", "fee_currency", "fee_type", "consultation_free",
  "address", "city", "state", "country", "contact_name", "contact_email", "contact_phone",
  "website", "booking_url",
];

// decimal/integer columns — Gemini routinely writes these as human-formatted strings
// ("97%", "$3,500", "4.8/5 stars", "10 years"), which Postgres rejects outright
// ("invalid input syntax for type numeric"). Every numeric visa-service field gets the
// same defensive coercion, not just the one that happened to be reported — same failure
// mode, same fix, everywhere it can occur. Scoped to visa-service fields only; the
// course pipeline's own coerceInt/coerceDate above are untouched.
const VISA_SERVICE_NUMERIC_FIELDS: Array<keyof ExtractedVisaService> = [
  "fee_amount", "fee_from", "fee_to", "consultation_fee", "success_rate",
  "cases_handled", "years_experience", "team_size", "qualified_agents_count",
  "average_rating", "review_count",
];

function coerceVisaNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const match = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return isNaN(n) ? null : n;
}

/**
 * Write a visa service, deduped by normalised name within the job — mirrors writeCourse's
 * dedup-and-merge (fills nulls on the existing row, never overwrites a value already found).
 * No child/junction tables: extraction_visa_services is flat, one row per distinct service.
 */
export async function writeVisaService(jobId: string, service: ExtractedVisaService): Promise<string> {
  const normName = normaliseVisaServiceName(service.name);
  const existing = await masterKnex(`${S}.extraction_visa_services`)
    .where({ job_id: jobId })
    .whereRaw("LOWER(TRIM(name)) = ?", [normName])
    .first();

  if (existing) {
    const updates: Record<string, unknown> = {};
    for (const field of VISA_SERVICE_SCALAR_FIELDS) {
      const newVal = service[field];
      if (newVal != null && newVal !== "" && (existing[field] == null || existing[field] === "")) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
      const newVal = coerceVisaNumber(service[field]);
      if (newVal != null && existing[field] == null) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_ARRAY_FIELDS) {
      const newVal = service[field] as string[] | undefined;
      if (newVal?.length && (!existing[field] || existing[field].length === 0)) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
      const newVal = service[field] as string[] | undefined;
      if (newVal?.length && (!existing[field] || existing[field].length === 0)) {
        updates[field] = JSON.stringify(newVal);
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_visa_services`).where({ id: existing.id }).update(updates);
      logger.info("Merged duplicate visa service", { jobId, id: existing.id, name: service.name });
    }
    return existing.id;
  }

  const insert: Record<string, unknown> = {
    job_id: jobId,
    name: service.name,
    status: "pending",
  };
  for (const field of VISA_SERVICE_SCALAR_FIELDS) {
    const val = service[field];
    if (val != null && val !== "") insert[field] = val;
  }
  for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
    const val = coerceVisaNumber(service[field]);
    if (val != null) insert[field] = val;
  }
  for (const field of VISA_SERVICE_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) insert[field] = val;
  }
  for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) insert[field] = JSON.stringify(val);
  }
  if (service.source_url) insert.source_url = service.source_url;

  const [row] = await masterKnex(`${S}.extraction_visa_services`).insert(insert).returning("id");
  logger.info("Wrote visa service", { jobId, id: row.id, name: service.name });
  return row.id;
}

/**
 * Overwrite a specific, already-known visa service row with fresh extraction results —
 * for the admin-triggered "re-extract this one" action, not the automatic per-page pipeline.
 * Unlike writeVisaService's merge branch (fills nulls only, for incidental multi-page
 * aggregation), this overwrites unconditionally: a deliberate manual re-run should trust the
 * new extraction, matching handleCourseDataStep's per-course re-extraction semantics.
 */
export async function updateVisaServiceById(id: string, service: Partial<ExtractedVisaService>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (service.name) updates.name = service.name;
  for (const field of VISA_SERVICE_SCALAR_FIELDS) {
    const val = service[field];
    if (val != null && val !== "") updates[field] = val;
  }
  for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
    const val = coerceVisaNumber(service[field]);
    if (val != null) updates[field] = val;
  }
  for (const field of VISA_SERVICE_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) updates[field] = val;
  }
  for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) updates[field] = JSON.stringify(val);
  }
  if (Object.keys(updates).length === 0) return;
  updates.updated_at = masterKnex.fn.now();
  await masterKnex(`${S}.extraction_visa_services`).where({ id }).update(updates);
  logger.info("Re-extracted visa service", { id, name: service.name });
}

/** Insert a queue item for a discovered URL */
export async function insertQueueItem(jobId: string, url: string) {
  const [row] = await masterKnex(`${S}.extraction_queue`)
    .insert({ job_id: jobId, url, status: "pending" })
    .returning("id");
  return row.id;
}

/** Write a job event to the timeline */
export async function writeJobEvent(jobId: string, kind: string, opts?: {
  level?: string;
  phase?: string;
  message?: string;
  data?: Record<string, unknown>;
}) {
  await masterKnex(`${S}.extraction_job_events`).insert({
    job_id: jobId,
    kind,
    level: opts?.level ?? "info",
    phase: opts?.phase ?? null,
    message: opts?.message ?? null,
    data: opts?.data ? JSON.stringify(opts.data) : "{}",
  });
}
