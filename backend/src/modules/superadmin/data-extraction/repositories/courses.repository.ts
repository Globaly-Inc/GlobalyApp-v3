// Extraction courses repository.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
const T = `${S}.extraction_courses`;

export type CourseListFilters = { search?: string; status?: string };
export type CourseSort = "newest" | "oldest" | "name_asc" | "name_desc";

function filteredCoursesQuery(jobId: string, { search, status }: CourseListFilters) {
  const q = masterKnex(T).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  if (status) q.where("verification_status", status);
  return q;
}

// Default ("oldest") matches the endpoint's original hardcoded order — unchanged for
// any caller that doesn't pass sort.
export async function listCoursesByJob(
  jobId: string, limit: number, offset: number,
  filters: CourseListFilters = {}, sort: CourseSort = "oldest",
) {
  const q = filteredCoursesQuery(jobId, filters).limit(limit).offset(offset);
  switch (sort) {
    case "name_asc": return q.orderBy("name", "asc");
    case "name_desc": return q.orderBy("name", "desc");
    case "newest": return q.orderBy("created_at", "desc");
    default: return q.orderBy("created_at", "asc");
  }
}

export async function countCoursesByJob(jobId: string, filters: CourseListFilters = {}) {
  const [row] = await filteredCoursesQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

export type CourseFeeListFilters = { search?: string };

function filteredCourseFeesQuery(jobId: string, { search }: CourseFeeListFilters) {
  const q = masterKnex(`${S}.extraction_course_fees`).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function listCourseFeesByJob(jobId: string, limit: number, offset: number, filters: CourseFeeListFilters = {}) {
  return filteredCourseFeesQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countCourseFeesByJob(jobId: string, filters: CourseFeeListFilters = {}) {
  const [row] = await filteredCourseFeesQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

// Powers the status filter dropdown — counts are over the whole job, not the current page.
export async function countCoursesByStatus(jobId: string) {
  const rows = await masterKnex(T)
    .where({ job_id: jobId })
    .select("verification_status")
    .count("id as count")
    .groupBy("verification_status");
  return rows.map((r) => ({ status: (r.verification_status as string | null) ?? "unverified", count: Number(r.count) }));
}

export type StudyUnitListFilters = { search?: string };

function filteredStudyUnitsQuery(jobId: string, { search }: StudyUnitListFilters) {
  const q = masterKnex(`${S}.extraction_study_units`).where({ job_id: jobId });
  if (search) q.where((b) => b.whereILike("unit_name", `%${search}%`).orWhereILike("unit_code", `%${search}%`));
  return q;
}

export async function listStudyUnitsByJob(jobId: string, limit: number, offset: number, filters: StudyUnitListFilters = {}) {
  return filteredStudyUnitsQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countStudyUnitsByJob(jobId: string, filters: StudyUnitListFilters = {}) {
  const [row] = await filteredStudyUnitsQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

export type StudyOptionListFilters = { search?: string };

function filteredStudyOptionsQuery(jobId: string, { search }: StudyOptionListFilters) {
  const q = masterKnex(`${S}.extraction_study_options`).where({ job_id: jobId });
  if (search) {
    q.where((b) => b.whereILike("name", `%${search}%`).orWhereILike("study_mode", `%${search}%`).orWhereILike("applicable_to", `%${search}%`));
  }
  return q;
}

export async function listStudyOptionsByJob(jobId: string, limit: number, offset: number, filters: StudyOptionListFilters = {}) {
  return filteredStudyOptionsQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countStudyOptionsByJob(jobId: string, filters: StudyOptionListFilters = {}) {
  const [row] = await filteredStudyOptionsQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

export type EligibilityListFilters = { search?: string };

function filteredEligibilityQuery(jobId: string, { search }: EligibilityListFilters) {
  const q = masterKnex(`${S}.extraction_eligibility_requirements`).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function listEligibilityByJob(jobId: string, limit: number, offset: number, filters: EligibilityListFilters = {}) {
  return filteredEligibilityQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countEligibilityByJob(jobId: string, filters: EligibilityListFilters = {}) {
  const [row] = await filteredEligibilityQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

export type IntakeListFilters = { search?: string };

function filteredIntakesQuery(jobId: string, { search }: IntakeListFilters) {
  const q = masterKnex(`${S}.extraction_intakes`).where({ job_id: jobId });
  if (search) q.whereILike("intake_name", `%${search}%`);
  return q;
}

export async function listIntakesByJob(jobId: string, limit: number, offset: number, filters: IntakeListFilters = {}) {
  return filteredIntakesQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countIntakesByJob(jobId: string, filters: IntakeListFilters = {}) {
  const [row] = await filteredIntakesQuery(jobId, filters).count("id as count");
  return Number(row.count);
}

export async function findCourseById(id: string) {
  return masterKnex(T).where({ id }).first();
}

export async function insertCourse(data: Record<string, unknown>) {
  const [row] = await masterKnex(T).insert(data).returning("id");
  return row;
}

export async function updateCourse(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(T)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function updateCoursesByIds(ids: string[], data: Record<string, unknown>) {
  return masterKnex(T)
    .whereIn("id", ids)
    .update({ ...data, updated_at: masterKnex.fn.now() });
}

export async function deleteCourse(id: string) {
  const count = await masterKnex(T).where({ id }).delete();
  return count > 0;
}

export async function deleteCoursesByIds(ids: string[]) {
  return masterKnex(T).whereIn("id", ids).delete();
}

// ── Course links (13-key bundle for RC2) ──

export async function getCourseLinks(jobId: string) {
  const tables: Record<string, string> = {
    intakes: `${S}.extraction_intakes`,
    study_options: `${S}.extraction_study_options`,
    eligibility_requirements: `${S}.extraction_eligibility_requirements`,
    accreditations: `${S}.extraction_accreditations`,
    course_fees: `${S}.extraction_course_fees`,
    study_units: `${S}.extraction_study_units`,
    intake_assignments: `${S}.extraction_course_intake_assignments`,
    study_option_assignments: `${S}.extraction_course_study_option_assignments`,
    accreditation_assignments: `${S}.extraction_course_accreditation_assignments`,
    eligibility_assignments: `${S}.extraction_course_eligibility_assignments`,
    course_campuses: `${S}.extraction_course_campuses`,
    fee_assignments: `${S}.extraction_course_fee_assignments`,
    study_unit_assignments: `${S}.extraction_course_study_unit_assignments`,
  };

  const queries = Object.entries(tables).map(([key, table]) => {
    // accreditations is a standalone table — no job_id filter
    if (key === "accreditations") {
      return masterKnex(table).select("*").then((rows) => [key, rows] as const);
    }
    const query = key.endsWith("_assignments")
      ? masterKnex(table).select(`${table}.*`, `${T}.name as course_name`)
        .leftJoin(T, `${table}.course_id`, `${T}.id`)
        .where(`${table}.job_id`, jobId)
      : masterKnex(table).where({ job_id: jobId });
    return query.then((rows) => [key, rows] as const);
  });

  const results = await Promise.all(queries);
  return Object.fromEntries(results);
}

// ── Accreditation links (E5-E7) ──

const T_ACCRED_ASSIGN = `${S}.extraction_course_accreditation_assignments`;
const T_ACCREDITATIONS = `${S}.extraction_accreditations`;

export async function getCourseAccreditationLinks(courseId: string) {
  return masterKnex(T_ACCRED_ASSIGN)
    .select(`${T_ACCRED_ASSIGN}.*`, `${T_ACCREDITATIONS}.name as accreditation_name`)
    .leftJoin(T_ACCREDITATIONS, `${T_ACCRED_ASSIGN}.extraction_accreditation_id`, `${T_ACCREDITATIONS}.id`)
    .where(`${T_ACCRED_ASSIGN}.course_id`, courseId);
}

export async function insertAccreditationLink(data: {
  job_id: string;
  course_id: string;
  accreditation_id: string;
}) {
  const [row] = await masterKnex(T_ACCRED_ASSIGN)
    .insert({
      job_id: data.job_id,
      course_id: data.course_id,
      accreditation_id: data.accreditation_id,
    })
    .returning("id");
  return row;
}

export async function deleteAccreditationLink(courseId: string, accreditationId: string) {
  const count = await masterKnex(T_ACCRED_ASSIGN)
    .where({ course_id: courseId, accreditation_id: accreditationId })
    .delete();
  return count > 0;
}
