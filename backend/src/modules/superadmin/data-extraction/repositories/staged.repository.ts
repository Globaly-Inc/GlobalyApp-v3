// Staged entities + junctions repository.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

// ── Generic insert/delete for staged entities ──

async function insertEntity(table: string, data: Record<string, unknown>) {
  const [row] = await masterKnex(`${S}.${table}`).insert(data).returning("id");
  return row;
}

async function deleteEntity(table: string, id: string) {
  const count = await masterKnex(`${S}.${table}`).where({ id }).delete();
  return count > 0;
}

async function updateEntity(table: string, id: string, data: Record<string, unknown>) {
  const count = await masterKnex(`${S}.${table}`).where({ id }).update(data);
  return count > 0;
}

// ── Study options ──

export const studyOptions = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_study_options", data),
  update: (id: string, data: Record<string, unknown>) => updateEntity("extraction_study_options", id, data),
  delete: (id: string) => deleteEntity("extraction_study_options", id),
};

// ── Course fees ──

export const courseFees = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_course_fees", data),
  update: (id: string, data: Record<string, unknown>) => updateEntity("extraction_course_fees", id, data),
  delete: (id: string) => deleteEntity("extraction_course_fees", id),
};

// ── Intakes ──

export const intakes = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_intakes", data),
  delete: (id: string) => deleteEntity("extraction_intakes", id),
};

// ── Eligibility requirements ──

export const eligibility = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_eligibility_requirements", data),
  update: (id: string, data: Record<string, unknown>) => updateEntity("extraction_eligibility_requirements", id, data),
  delete: (id: string) => deleteEntity("extraction_eligibility_requirements", id),
};

// ── Study units ──

export const studyUnits = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_study_units", data),
  update: (id: string, data: Record<string, unknown>) => updateEntity("extraction_study_units", id, data),
  delete: (id: string) => deleteEntity("extraction_study_units", id),
};

// ── Staged accreditations ──

export const accreditations = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_accreditations", data),
  delete: (id: string) => deleteEntity("extraction_accreditations", id),
};

export async function countAccreditationsByJob(jobId: string) {
  const [row] = await masterKnex(`${S}.extraction_course_accreditation_assignments`)
    .where({ job_id: jobId })
    .countDistinct("extraction_accreditation_id as count");
  return Number(row.count);
}

/** Scraped accreditations that appear in this job's junction rows, plus the rows themselves. */
export async function getJobAccreditations(jobId: string) {
  const assignments = await masterKnex(`${S}.extraction_course_accreditation_assignments as a`)
    .leftJoin(`${S}.extraction_courses as c`, "c.id", "a.course_id")
    .where("a.job_id", jobId)
    .select("a.extraction_accreditation_id", "a.accreditation_id", "a.course_id", "c.name as course_name");
  const ids = [...new Set(assignments.map((r) => r.extraction_accreditation_id).filter(Boolean))];
  const scraped = ids.length
    ? await masterKnex(`${S}.extraction_accreditations`).whereIn("id", ids).orderBy("name")
    : [];
  return { scraped, assignments };
}

// ── Global accreditation library (superadmin.accreditations) ──

const T_LIBRARY = `${S}.accreditations`;

export const accreditationLibrary = {
  list: () => masterKnex(T_LIBRARY).orderBy("name").limit(500),
  insert: async (data: Record<string, unknown>) => {
    const [row] = await masterKnex(T_LIBRARY).insert(data).returning("*");
    return row;
  },
  update: async (id: string, patch: Record<string, unknown>) => {
    const [row] = await masterKnex(T_LIBRARY)
      .where({ id })
      .update({ ...patch, updated_at: masterKnex.fn.now() })
      .returning("*");
    return row;
  },
  delete: (id: string) => masterKnex(T_LIBRARY).where({ id }).delete(),
};

// ── Agents ──

export const agents = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_agents", data),
  delete: (id: string) => deleteEntity("extraction_agents", id),
};

// ── Campuses ──

export const campuses = {
  insert: (data: Record<string, unknown>) => insertEntity("extraction_campuses", data),
  delete: (id: string) => deleteEntity("extraction_campuses", id),
};

// ── Junctions ──

const JUNCTION_TABLE_MAP: Record<string, { table: string; entityCol: string }> = {
  "study-options": { table: "extraction_course_study_option_assignments", entityCol: "study_option_id" },
  "course-fees": { table: "extraction_course_fee_assignments", entityCol: "course_fee_id" },
  intakes: { table: "extraction_course_intake_assignments", entityCol: "intake_id" },
  "eligibility-requirements": { table: "extraction_course_eligibility_assignments", entityCol: "eligibility_requirement_id" },
  "study-units": { table: "extraction_course_study_unit_assignments", entityCol: "study_unit_id" },
  accreditations: { table: "extraction_course_accreditation_assignments", entityCol: "extraction_accreditation_id" },
  campuses: { table: "extraction_course_campuses", entityCol: "campus_id" },
};

export function getJunctionInfo(slug: string) {
  return JUNCTION_TABLE_MAP[slug];
}

export async function assignJunction(
  slug: string,
  data: { job_id: string; course_id: string; entity_id: string },
) {
  const info = JUNCTION_TABLE_MAP[slug];
  if (!info) return null;
  const [row] = await masterKnex(`${S}.${info.table}`)
    .insert({
      job_id: data.job_id,
      course_id: data.course_id,
      [info.entityCol]: data.entity_id,
    })
    .returning("id");
  return row;
}

export async function unassignJunction(
  slug: string,
  data: { job_id: string; course_id: string; entity_id: string },
) {
  const info = JUNCTION_TABLE_MAP[slug];
  if (!info) return false;
  const count = await masterKnex(`${S}.${info.table}`)
    .where({
      job_id: data.job_id,
      course_id: data.course_id,
      [info.entityCol]: data.entity_id,
    })
    .delete();
  return count > 0;
}

// ── Accreditation mappings (J3) ──

export async function updateAccreditationMappings(
  jobId: string,
  extractionAccreditationIds: string[],
  accreditationId: string | null,
) {
  const count = await masterKnex(`${S}.extraction_course_accreditation_assignments`)
    .where({ job_id: jobId })
    .whereIn("extraction_accreditation_id", extractionAccreditationIds)
    .update({ accreditation_id: accreditationId });
  return count;
}
