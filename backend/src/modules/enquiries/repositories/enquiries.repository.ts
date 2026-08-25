// Enquiries repository — reads/writes against globalyapp.enquiries.
// course_id/extraction_job_id validation reaches into superadmin.extraction_courses/jobs
// (cross-schema, not cross-database — same pattern as match-directory-sync.service.ts).

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

const T = "enquiries";

export interface EnquiryRow {
  id: string;
  student_id: number;
  course_id: string;
  extraction_job_id: string | null;
  business_id: number | null;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  student_country_code: string | null;
  student_latitude: number | null;
  student_longitude: number | null;
  status: string;
  max_accepts: number;
  accept_count: number;
  distribution_count: number;
  last_distributed_at: Date | null;
  closed_at: Date | null;
  close_reason: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export async function findExtractionCourseById(courseId: string) {
  return masterKnex("superadmin.extraction_courses").where({ id: courseId }).first("id", "job_id");
}

/**
 * The institution a job was promoted to — `public.institutions`, the canonical entity,
 * not the raw `extraction_institution_overview` row. Null when the job was never promoted.
 *
 * `institutions_source_job_uniq` (partial unique on source_job_id) guarantees at most one
 * row per job, so `.first()` is exact rather than a 1:1-in-practice assumption. Soft-deleted
 * institutions are excluded — the unique index does not filter them, so a deleted row would
 * otherwise still claim the job.
 */
export async function findInstitutionIdByJobId(jobId: string): Promise<number | null> {
  const row = await masterKnex("institutions")
    .where({ source_job_id: jobId })
    .whereNull("deleted_at")
    .first("id");
  return row?.id ?? null;
}

export async function findBusinessById(businessId: number) {
  return masterKnex("businesses")
    .where({ id: businessId })
    .whereNull("deleted_at")
    .first("id", "enquiry_enabled", "status");
}

export async function insert(data: {
  student_id: number;
  course_id: string;
  extraction_job_id: string | null;
  business_id: number | null;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  student_country_code: string | null;
  student_latitude: number | null;
  student_longitude: number | null;
}): Promise<EnquiryRow> {
  const [row] = await masterKnex(T)
    .insert({ ...data, status: "pending" })
    .returning("*");
  return row;
}

export async function findById(id: string): Promise<EnquiryRow | undefined> {
  return masterKnex(T).where({ id }).whereNull("deleted_at").first();
}

// Detail view: same course/institution join as listForStudent, but keyed to a single id.
export async function findByIdWithNames(
  id: string,
): Promise<(EnquiryRow & { course_name: string; course_short_name: string | null; institution_name: string | null; institution_logo_url: string | null }) | undefined> {
  return masterKnex(`${T} as e`)
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .where("e.id", id)
    .whereNull("e.deleted_at")
    .select(
      "e.*",
      "c.name as course_name",
      "c.short_name as course_short_name",
      "o.name as institution_name",
      "o.logo_url as institution_logo_url",
    )
    .first();
}

// Business context (req.auth.orgId) is a schema_name, not businesses.id — every
// business-scoped enquiry route needs this resolved once up front.
export async function findBusinessBySchemaName(schemaName: string) {
  return masterKnex("businesses").where({ schema_name: schemaName }).whereNull("deleted_at").first("id");
}

export async function findByIdForUpdate(trx: Knex.Transaction, id: string): Promise<EnquiryRow | undefined> {
  return trx(T).where({ id }).whereNull("deleted_at").forUpdate().first();
}

export async function updateById(trx: Knex.Transaction, id: string, data: Record<string, unknown>) {
  const [row] = await trx(T)
    .where({ id })
    .update({ ...data, updated_at: trx.fn.now() })
    .returning("*");
  return row;
}

export interface EnquiryListRow {
  id: string;
  status: string;
  created_at: Date;
  preferred_intake: string | null;
  preferred_year: number | null;
  course_name: string;
  course_short_name: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
}

export async function listForStudent(
  studentId: number,
  opts: { limit: number; offset: number; status?: string },
): Promise<EnquiryListRow[]> {
  const query = masterKnex(`${T} as e`)
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .where("e.student_id", studentId)
    .whereNull("e.deleted_at")
    .select(
      "e.id",
      "e.status",
      "e.created_at",
      "e.preferred_intake",
      "e.preferred_year",
      "c.name as course_name",
      "c.short_name as course_short_name",
      "o.name as institution_name",
      "o.logo_url as institution_logo_url",
    )
    .orderBy("e.created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
  if (opts.status) query.where("e.status", opts.status);
  return query;
}

export async function countForStudent(studentId: number, opts: { status?: string }): Promise<number> {
  const query = masterKnex(T).where({ student_id: studentId }).whereNull("deleted_at");
  if (opts.status) query.where("status", opts.status);
  const [{ count }] = await query.count("id as count");
  return Number(count);
}

/**
 * Businesses that have PAID to unlock this enquiry — the only recipients a student
 * is allowed to see. Gated on `unlocked_at`, not on status: a business that
 * unlocked and later closed its copy still unlocked it, and the student should keep
 * seeing who holds their details.
 *
 * `logo_url` comes back as a raw storage path; the service signs it.
 */
export async function listUnlockedBusinessesForEnquiry(enquiryId: string) {
  return masterKnex("enquiry_distributions as d")
    .join("businesses as b", "b.id", "d.business_id")
    .where("d.enquiry_id", enquiryId)
    .whereNotNull("d.unlocked_at")
    .whereNull("d.deleted_at")
    .orderBy("d.unlocked_at", "asc")
    .select(
      // The thread is addressed by distribution, so the client needs this to open chat.
      "d.id as distribution_id",
      "b.id as business_id",
      "b.business_name",
      "b.logo_url",
      "b.city",
      "d.unlocked_at",
      "d.status",
    );
}
