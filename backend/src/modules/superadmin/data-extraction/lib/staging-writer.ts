// Writes LLM-extracted data to the staging tables with proper relationships.

import type { Knex } from "knex";

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

/**
 * Money, kept to the cent.
 *
 * total_amount is NUMERIC and 971 of the 8,541 fee rows in the migrated corpus are
 * fractional (20938.50, 16462.75). coerceInt would floor every one of them, losing
 * up to 99c per fee silently — so amounts get their own coercion, which only rejects
 * what is not a finite number.
 */
function coerceAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Find a staged child row that already carries exactly this content, else insert it.
 *
 * The queue re-delivers: LavinMQ redelivers an unacked message, the page worker
 * retries a blocked page, and an admin re-runs a step. Each of those calls
 * writeCourse again with the same payload. Inserting a fresh child row every time
 * makes the junction's UNIQUE(course_id, child_id) useless — the new id never
 * conflicts — so the course quietly accumulates a second copy of every fee, intake
 * and requirement, and promote carries the duplicates into the live catalog. Keying
 * the child by its content is what makes the re-delivery a no-op (defect D8).
 *
 * ponytail: content match, not a stored hash. Two workers racing on the same page can
 * still both insert; the junction's UNIQUE then collapses the pair for everything
 * except extraction_course_campuses, which has no unique index. Add one if the race
 * ever shows up in the review queue.
 */
async function findOrInsert(
  trx: Knex,
  table: string,
  match: Record<string, unknown>,
): Promise<string> {
  const existing = await trx(table).where(match).first("id");
  if (existing) return existing.id as string;
  const [inserted] = await trx(table).insert(match).returning("id");
  return inserted.id as string;
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
  // One course is one unit of work. Without this, a child insert that fails (an
  // unparseable intake date, a check constraint) leaves the course row and the
  // children written before it committed — half a batch, and no record that the
  // other half is missing.
  return masterKnex.transaction((trx) => writeCourseIn(trx, jobId, course, campusIdMap));
}

async function writeCourseIn(
  trx: Knex,
  jobId: string,
  course: ExtractedCourse,
  campusIdMap: Map<string, string>,
): Promise<string> {
  // ── Dedup: check if this course name already exists for this job ──
  const normName = normaliseCourseName(course.name);
  const existing = await trx(`${S}.extraction_courses`)
    .where({ job_id: jobId })
    // The comparison has to apply the same normalisation the probe does, or the
    // dedup only catches names that needed no normalising: "Bachelor of Nursing."
    // and "Bachelor  of Nursing" normalise to a stored row's key but did not equal
    // LOWER(TRIM(name)), so each re-delivery inserted another course. 5 of the 26
    // duplicate name groups in the migrated corpus are exactly this.
    .whereRaw(
      "regexp_replace(regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g'), '[^a-z0-9]+$', '') = ?",
      [normName],
    )
    .first();

  let courseId: string;

  if (existing) {
    courseId = existing.id;
    // Merge: fill nulls on the existing row with data from this extraction
    const updates: Record<string, unknown> = {};
    const mergeFields: Array<keyof ExtractedCourse> = [
      "short_name", "degree_level", "subject_area", "duration_weeks",
      "study_mode", "description", "domestic_fee_total", "domestic_currency",
      "international_fee_total", "international_currency", "awarding_institution",
      "source_url",
    ];
    for (const field of mergeFields) {
      const newVal = field === "duration_weeks" ? coerceInt(course[field]) : (course[field] ?? null);
      if (newVal != null && newVal !== "" && (existing[field] == null || existing[field] === "")) {
        updates[field] = newVal;
      }
    }
    if (course.career_paths?.length && (!existing.career_paths || existing.career_paths.length === 0)) {
      updates.career_paths = course.career_paths;
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = trx.fn.now();
      await trx(`${S}.extraction_courses`).where({ id: courseId }).update(updates);
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

    const [courseRow] = await trx(`${S}.extraction_courses`).insert(courseInsert).returning("id");
    courseId = courseRow.id;
  }

  // ── Fees + assignments ──
  if (course.fees?.length) {
    for (const fee of course.fees) {
      const feeId = await findOrInsert(trx, `${S}.extraction_course_fees`, {
        job_id: jobId,
        name: fee.name ?? null,
        student_type: fee.student_type ?? "both",
        period_type: fee.period_type ?? "Per Year",
        currency: fee.currency ?? "AUD",
        total_amount: coerceAmount(fee.total_amount) ?? 0,
      });
      await trx(`${S}.extraction_course_fee_assignments`)
        .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeId })
        .onConflict(["course_id", "course_fee_id"]).ignore();
    }
  }

  // ── Intakes + assignments ──
  if (course.intakes?.length) {
    for (const intake of course.intakes) {
      const intakeId = await findOrInsert(trx, `${S}.extraction_intakes`, {
        job_id: jobId,
        course_id: courseId,
        intake_name: intake.intake_name ?? null,
        start_date: coerceDate(intake.start_date),
        end_date: coerceDate(intake.end_date),
        intake_month: coerceMonth(intake.intake_month),
        intake_year: coerceInt(intake.intake_year),
        admission_deadline: coerceDate(intake.admission_deadline),
      });
      await trx(`${S}.extraction_course_intake_assignments`)
        .insert({ job_id: jobId, course_id: courseId, intake_id: intakeId })
        .onConflict(["course_id", "intake_id"]).ignore();
    }
  }

  // ── Study options + assignments ──
  if (course.study_options?.length) {
    for (const opt of course.study_options) {
      const optId = await findOrInsert(trx, `${S}.extraction_study_options`, {
        job_id: jobId,
        name: opt.name ?? null,
        study_mode: opt.study_mode ?? "on_campus",
        study_load: opt.study_load ?? "full_time",
        duration_value: coerceInt(opt.duration_value),
        duration_unit: opt.duration_unit ?? "months",
      });
      await trx(`${S}.extraction_course_study_option_assignments`)
        .insert({ job_id: jobId, course_id: courseId, study_option_id: optId })
        .onConflict(["course_id", "study_option_id"]).ignore();
    }
  }

  // ── Eligibility requirements + assignments ──
  if (course.eligibility?.length) {
    for (const elig of course.eligibility) {
      const eligId = await findOrInsert(trx, `${S}.extraction_eligibility_requirements`, {
        job_id: jobId,
        name: elig.name ?? null,
        applicable_to: elig.applicable_to ?? "both",
        description: elig.description ?? null,
        min_score_percent: coerceAmount(elig.min_score_percent),
        min_degree_level: elig.min_degree_level ?? null,
      });
      await trx(`${S}.extraction_course_eligibility_assignments`)
        .insert({ job_id: jobId, course_id: courseId, eligibility_requirement_id: eligId })
        .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
    }
  }

  // ── English requirements ──
  // No junction table: the row carries course_id directly, so its content match is
  // the only thing standing between a re-delivery and a second copy of the IELTS row.
  if (course.english_requirements?.length) {
    for (const eng of course.english_requirements) {
      await findOrInsert(trx, `${S}.extraction_english_requirements`, {
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
        // extraction_course_campuses has no unique index, so ON CONFLICT DO NOTHING
        // had nothing to conflict on and every re-delivery added another link. The
        // corpus already carries one such duplicated pair.
        await findOrInsert(trx, `${S}.extraction_course_campuses`, {
          job_id: jobId,
          course_id: courseId,
          campus_id: campusId,
          campus_name: campusName,
        });
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
  // Transactional for the same reason writeCourse is, only sharper: this deletes
  // every campus and every course-campus junction the job has before writing the
  // replacements. A failure between the two halves leaves the job's courses attached
  // to no campus at all, which reads as "this university has no campuses" rather
  // than as an error.
  return masterKnex.transaction((trx) => replaceCampusesIn(trx, jobId, campuses));
}

async function replaceCampusesIn(
  trx: Knex,
  jobId: string,
  campuses: ExtractedCampus[],
): Promise<Map<string, string>> {
  // Load existing junctions before deleting campuses
  const existingJunctions = await trx(`${S}.extraction_course_campuses`)
    .where({ job_id: jobId })
    .select("course_id", "campus_id", "campus_name");

  // Build old-id → name map from existing campuses
  const oldCampuses = await trx(`${S}.extraction_campuses`).where({ job_id: jobId });
  const oldIdToName = new Map<string, string>();
  for (const c of oldCampuses) {
    oldIdToName.set(c.id, normaliseCampusName(c.name));
  }

  // Delete existing campuses (cascade deletes junctions via DB or we re-create)
  await trx(`${S}.extraction_course_campuses`).where({ job_id: jobId }).delete();
  await trx(`${S}.extraction_campuses`).where({ job_id: jobId }).delete();

  // Insert new campuses, dedup by normalised name
  const idMap = new Map<string, string>();
  for (const campus of campuses) {
    if (!campus.name) continue;
    const norm = normaliseCampusName(campus.name);
    if (idMap.has(norm)) continue;
    const [row] = await trx(`${S}.extraction_campuses`)
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
      // findOrInsert, not ON CONFLICT DO NOTHING: this table has no unique index, so
      // a job whose junctions already carried a duplicated pair would have the
      // duplicate faithfully re-created here.
      await findOrInsert(trx, `${S}.extraction_course_campuses`, {
        job_id: jobId,
        course_id: junc.course_id,
        campus_id: newCampusId,
        campus_name: junc.campus_name,
      });
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
