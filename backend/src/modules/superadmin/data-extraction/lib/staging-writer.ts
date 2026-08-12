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
  subject_area?: string | null;
  duration_weeks?: number | null;
  study_mode?: string | null;
  description?: string | null;
  domestic_fee_total?: number | null;
  domestic_currency?: string | null;
  international_fee_total?: number | null;
  international_currency?: string | null;
  awarding_institution?: string | null;
  source_url?: string | null;
  career_paths?: string[] | null;
  fees?: ExtractedFee[];
  intakes?: ExtractedIntake[];
  study_options?: ExtractedStudyOption[];
  eligibility?: ExtractedEligibility[];
  english_requirements?: ExtractedEnglishReq[];
  campus_names?: string[];
}

export interface ExtractedFee {
  name?: string | null;
  student_type?: string;
  period_type?: string;
  currency?: string;
  total_amount?: number;
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

function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.floor(n);
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

/**
 * Write a full course with all its child entities and junction assignments.
 * Returns the course ID.
 */
export async function writeCourse(jobId: string, course: ExtractedCourse, campusIdMap: Map<string, string>): Promise<string> {
  // ── Insert course ──
  const courseInsert: Record<string, unknown> = {
    job_id: jobId,
    name: course.name,
    short_name: course.short_name ?? null,
    degree_level: course.degree_level ?? null,
    subject_area: course.subject_area ?? null,
    duration_weeks: coerceInt(course.duration_weeks),
    study_mode: course.study_mode ?? null,
    description: course.description ?? null,
    domestic_fee_total: course.domestic_fee_total ?? null,
    domestic_currency: course.domestic_currency ?? null,
    international_fee_total: course.international_fee_total ?? null,
    international_currency: course.international_currency ?? null,
    awarding_institution: course.awarding_institution ?? null,
    source_url: course.source_url ?? null,
    verification_status: "unverified",
  };
  if (course.career_paths?.length) courseInsert.career_paths = course.career_paths;

  const [courseRow] = await masterKnex(`${S}.extraction_courses`).insert(courseInsert).returning("id");
  const courseId = courseRow.id;

  // ── Fees + assignments ──
  if (course.fees?.length) {
    for (const fee of course.fees) {
      const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
        .insert({
          job_id: jobId,
          name: fee.name ?? null,
          student_type: fee.student_type ?? "both",
          period_type: fee.period_type ?? "Per Year",
          currency: fee.currency ?? "AUD",
          total_amount: coerceInt(fee.total_amount) ?? 0,
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
          start_date: intake.start_date ?? null,
          end_date: intake.end_date ?? null,
          intake_month: coerceMonth(intake.intake_month),
          intake_year: coerceInt(intake.intake_year),
          admission_deadline: intake.admission_deadline ?? null,
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

// ── Service category extraction ──

export const SERVICE_EXTRACTION_TABLES: Record<string, string> = {
  accommodation: "extraction_accommodation",
  insurance: "extraction_insurance",
  banking: "extraction_banking",
  visa_services: "extraction_visa_services",
  test_preparation: "extraction_test_preparation",
  career_services: "extraction_career_services",
  translation: "extraction_translation",
  transport: "extraction_transport",
};

export async function writeServiceItem(
  jobId: string,
  table: string,
  data: Record<string, unknown>,
): Promise<string> {
  const insert: Record<string, unknown> = { job_id: jobId };
  for (const [key, val] of Object.entries(data)) {
    if (key === "id" || key === "job_id") continue;
    if (val != null && val !== "") {
      // Stringify arrays and objects for jsonb columns
      insert[key] = (Array.isArray(val) || (typeof val === "object" && val !== null))
        ? JSON.stringify(val)
        : val;
    }
  }
  const [row] = await masterKnex(`${S}.${table}`).insert(insert).returning("id");
  logger.info(`Wrote ${table} item`, { jobId, id: row.id });
  return row.id;
}
