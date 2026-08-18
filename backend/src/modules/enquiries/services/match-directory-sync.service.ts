// Match directory sync — rebuilds a business's enquiry_match_directory rows
// from its active representations + businesses/extraction_courses data.
//
// The directory's verification_status/is_suspended are derived from
// businesses.status, the single column admins actually maintain (PATCH
// /businesses/:id/status): 'verified' grants the verified tier, 'suspended'
// takes the business out of routing.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as representationsRepo from "../repositories/representations.repository.js";
import * as matchDirectoryRepo from "../repositories/match-directory.repository.js";
import type { MatchDirectoryRow } from "../repositories/match-directory.repository.js";

export async function syncForBusiness(businessId: number): Promise<void> {
  const activeReps = await representationsRepo.listActiveByBusiness(businessId);

  const business = await masterKnex("businesses")
    .leftJoin("countries", "businesses.country_id", "countries.id")
    .where("businesses.id", businessId)
    .select(
      "businesses.status",
      "businesses.enquiry_enabled",
      "businesses.latitude",
      "businesses.longitude",
      "countries.iso2 as country_code",
    )
    .first();

  if (!business) {
    // Business no longer exists — clear it out of the routing index.
    await matchDirectoryRepo.replaceForBusiness(businessId, []);
    return;
  }

  // `enquiry_enabled` is the per-business opt-out; an opted-out business must
  // not be routable at all, so it is kept out of the directory rather than
  // filtered at match time (matching reads the directory, not businesses).
  if (business.enquiry_enabled === false) {
    await matchDirectoryRepo.replaceForBusiness(businessId, []);
    return;
  }

  if (activeReps.length === 0) {
    await matchDirectoryRepo.replaceForBusiness(businessId, []);
    return;
  }

  const courseIds = [...new Set(activeReps.map((r) => r.extraction_course_id).filter((id): id is string => !!id))];
  const courses = courseIds.length
    ? await masterKnex("superadmin.extraction_courses").whereIn("id", courseIds).select("id", "subject_area", "country_code")
    : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // "Sole representer" rule: a business acts as an institution's contact when it
  // is the ONLY active representer of that institution. That makes the
  // institution-direct fallback reachable without a new admin flow or column.
  //
  // The flag is business-level (the directory has no job_id column) while the
  // rule is institution-level, so it means "is the sole representer of at least
  // one institution it represents". That's safe because the fallback query
  // additionally scopes by job through `representations`, and it only ever runs
  // when zero agents matched — an institution with several representers would
  // have matched them in the tiers already.
  const jobIds = [...new Set(activeReps.map((r) => r.extraction_job_id).filter((id): id is string => !!id))];
  const isSoleRepresenter = jobIds.length > 0 && (await hasSoleRepresentedInstitution(businessId, jobIds));

  const rows: MatchDirectoryRow[] = activeReps.map((rep) => {
    const course = rep.extraction_course_id ? courseById.get(rep.extraction_course_id) : undefined;
    return {
      business_id: businessId,
      subject_area: course?.subject_area ?? null,
      country_code: course?.country_code ?? business.country_code ?? null,
      verification_status: business.status === "verified" ? "verified" : "unverified",
      latitude: business.latitude ?? null,
      longitude: business.longitude ?? null,
      is_suspended: business.status === "suspended",
      is_institution_contact: isSoleRepresenter,
    };
  });

  await matchDirectoryRepo.replaceForBusiness(businessId, rows);
}

/** True when this business is the only active representer of any of these institutions. */
async function hasSoleRepresentedInstitution(businessId: number, jobIds: string[]): Promise<boolean> {
  const rows = await masterKnex("representations")
    .whereIn("extraction_job_id", jobIds)
    .where({ status: "active" })
    .whereNull("deleted_at")
    .groupBy("extraction_job_id")
    .select("extraction_job_id")
    .countDistinct("business_id as representers")
    .havingRaw("count(distinct business_id) = 1");

  if (rows.length === 0) return false;

  // A single-representer institution could belong to a *different* business, so
  // confirm this business is the one holding it.
  const soleJobIds = rows.map((r) => String(r.extraction_job_id));
  const mine = await masterKnex("representations")
    .where({ business_id: businessId, status: "active" })
    .whereNull("deleted_at")
    .whereIn("extraction_job_id", soleJobIds)
    .first("id");

  return !!mine;
}
