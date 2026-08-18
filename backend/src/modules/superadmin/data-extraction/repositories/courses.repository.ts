// Extraction courses repository.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
const T = `${S}.extraction_courses`;

export async function listCoursesByJob(jobId: string) {
  return masterKnex(T).where({ job_id: jobId }).orderBy("created_at", "asc");
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
    const query =
      key === "accreditations"
        ? masterKnex(table).select("*")
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
