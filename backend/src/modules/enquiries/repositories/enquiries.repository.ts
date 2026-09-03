// Enquiries repository — reads/writes against globalyapp.enquiries.
// course_id/extraction_job_id validation reaches into superadmin.extraction_courses/jobs
// (cross-schema, not cross-database — one pool, an explicit `superadmin.` prefix).

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
  /** EligibilityVerdict as stored at submission. Null for enquiries predating the check. */
  eligibility_snapshot: unknown | null;
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

/**
 * `search` matches the course or the institution, not the message.
 *
 * Those are the two things a student can actually recall about an enquiry they sent weeks ago —
 * and the message is often empty now that it is optional, so searching it would return nothing for
 * a growing share of rows.
 */
function studentEnquiries(studentId: number, opts: { status?: string; search?: string }) {
  const query = masterKnex(`${T} as e`)
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .where("e.student_id", studentId)
    .whereNull("e.deleted_at");
  // Comma-separated so a UI filter group ("Active" = pending + distributed + unlocked …) maps to
  // one request. A single value still works — it is just a list of one.
  if (opts.status) query.whereIn("e.status", opts.status.split(",").map((v) => v.trim()).filter(Boolean));
  if (opts.search) {
    const term = `%${opts.search}%`;
    query.where((q) =>
      q.whereILike("c.name", term).orWhereILike("c.short_name", term).orWhereILike("o.name", term),
    );
  }
  return query;
}

export async function listForStudent(
  studentId: number,
  opts: { limit: number; offset: number; status?: string; search?: string },
): Promise<EnquiryListRow[]> {
  return studentEnquiries(studentId, opts)
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
}

/**
 * Counted through the same builder as the list, so a filtered page can never report the unfiltered
 * total — the bug that makes a paginator offer page 3 of an empty result.
 */
/**
 * How many enquiries this student has in each status, honouring `search` but NOT `status` — the
 * chips have to keep showing their own totals while one of them is selected, and they must count
 * every row rather than the current page.
 */
export async function countsByStatusForStudent(
  studentId: number,
  opts: { search?: string } = {},
): Promise<Record<string, number>> {
  const rows = await studentEnquiries(studentId, opts).groupBy("e.status").select("e.status").count("e.id as count");
  return Object.fromEntries(rows.map((r: any) => [r.status, Number(r.count)]));
}

export async function countForStudent(
  studentId: number,
  opts: { status?: string; search?: string },
): Promise<number> {
  const [{ count }] = await studentEnquiries(studentId, opts).count("e.id as count");
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
    // LEFT joins to both recipient tables, not an inner join to businesses: a fallback
    // distribution has no business, and an inner join silently dropped it — leaving the
    // student with an empty "who has my details" list while an institution was already
    // messaging them.
    .leftJoin("businesses as b", "b.id", "d.business_id")
    .leftJoin("institutions as i", "i.id", "d.institution_id")
    .where("d.enquiry_id", enquiryId)
    .whereNotNull("d.unlocked_at")
    .whereNull("d.deleted_at")
    .orderBy("d.unlocked_at", "asc")
    .select(
      // The thread is addressed by distribution, so the client needs this to open chat.
      "d.id as distribution_id",
      // One id field for two id spaces, which is why the kind travels with it. The student
      // UI only labels and links by distribution, so nothing joins back on this.
      masterKnex.raw("coalesce(b.id, i.id) as business_id"),
      masterKnex.raw("case when d.institution_id is null then 'business' else 'institution' end as recipient_kind"),
      masterKnex.raw("coalesce(b.business_name, i.institution_name) as business_name"),
      masterKnex.raw("coalesce(b.logo_url, i.logo_url) as logo_url"),
      masterKnex.raw("coalesce(b.city, i.city) as city"),
      "d.unlocked_at",
      "d.status",
    );
}
