// Representations repository — CRUD against globalyapp.representations.
// Business<->institution/course eligibility substrate (PRD §8.1).

import { masterKnex } from "../../../core/db/master-pool.js";

const T = "representations";

export interface Representation {
  id: string;
  business_id: number;
  extraction_job_id: string | null;
  extraction_course_id: string | null;
  status: "active" | "inactive";
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// Postgres unique_violation code — thrown by the DB when the
// (business_id, extraction_job_id, extraction_course_id) UNIQUE constraint is hit.
export const PG_UNIQUE_VIOLATION = "23505";

export async function create(opts: {
  businessId: number;
  extractionJobId: string | null;
  extractionCourseId: string | null;
}): Promise<Representation> {
  const [row] = await masterKnex(T)
    .insert({
      business_id: opts.businessId,
      extraction_job_id: opts.extractionJobId,
      extraction_course_id: opts.extractionCourseId,
      status: "active",
    })
    .returning("*");
  return row;
}

export async function findById(id: string): Promise<Representation | undefined> {
  return masterKnex(T).where({ id }).whereNull("deleted_at").first();
}

export async function listByBusiness(businessId: number): Promise<Representation[]> {
  return masterKnex(T).where({ business_id: businessId }).whereNull("deleted_at").orderBy("created_at", "desc");
}

export async function listActiveByBusiness(businessId: number): Promise<Representation[]> {
  return masterKnex(T).where({ business_id: businessId, status: "active" }).whereNull("deleted_at");
}

/**
 * Businesses that actually represent the enquiry's institution or course — the
 * "institution reps" pool for the rep tiers.
 *
 * Granularity is decided by whether the representation names a course:
 *   - `extraction_course_id` set  -> scoped to THAT course only.
 *   - `extraction_course_id` NULL -> covers every course at `extraction_job_id`.
 *
 * The distinction matters because a course-specific row also carries its
 * institution's job_id. Matching on job_id alone therefore let a business that
 * represents one Cornell course receive enquiries for every other Cornell course.
 *
 * Course and institution matches are NOT split into separate tiers — tiers are
 * graded by verification/country/distance, not representation granularity.
 */
export async function findRepresentingBusinesses(opts: {
  extractionJobId: string | null;
  courseId: string | null;
}): Promise<Array<{ business_id: number; representation_id: string }>> {
  const { extractionJobId, courseId } = opts;
  if (!extractionJobId && !courseId) return [];

  const rows = await masterKnex(T)
    // DISTINCT ON keeps one representation per business — the id is recorded on
    // every distribution, so a business holding both a course-scoped row and an
    // institution-level one needs a deterministic winner rather than an arbitrary
    // one. The course-scoped row wins: it is the more precise reason this
    // business matched this enquiry.
    .select(masterKnex.raw("DISTINCT ON (business_id) business_id, id as representation_id"))
    .where({ status: "active" })
    .whereNull("deleted_at")
    .where((qb) => {
      // Course-specific: naming a course scopes the representation TO that course.
      // It must not also match every other course at the same institution just
      // because the row happens to carry that institution's job_id too.
      if (courseId) {
        qb.orWhere((sub) => sub.whereNotNull("extraction_course_id").andWhere({ extraction_course_id: courseId }));
      }
      // Institution-level: only a row with NO course named covers all its courses.
      if (extractionJobId) {
        qb.orWhere((sub) => sub.whereNull("extraction_course_id").andWhere({ extraction_job_id: extractionJobId }));
      }
    })
    .orderByRaw("business_id, (extraction_course_id IS NOT NULL) DESC, created_at ASC");

  return (rows as unknown as Array<{ business_id: number; representation_id: string }>).map((r) => ({
    business_id: Number(r.business_id),
    representation_id: r.representation_id,
  }));
}

export async function deactivate(id: string): Promise<Representation | undefined> {
  const [row] = await masterKnex(T)
    .where({ id })
    .whereNull("deleted_at")
    .update({ status: "inactive", updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}
