// Matching engine — PRD §12 / Appendix A.3. Turns a `pending` enquiry into
// `enquiry_distributions` rows (or `no_match`).
//
// Idempotency: the entry point only acts on enquiries whose status is still
// 'pending'. Once matched, status flips to 'distributed'/'no_match', so a
// second run (e.g. a redelivered queue message) is a no-op before it ever
// reaches the insert. The `ON CONFLICT (enquiry_id, business_id) DO NOTHING`
// in distributions.repository is the belt-and-suspenders backstop in case
// that guard is ever bypassed (e.g. manual re-trigger while still 'pending').
//
// `representations` is the ONLY filter on who receives an enquiry: a business
// must hold an active representation for the enquiry's course, or for its
// institution with no course named. There is no general/subject-matched fallback
// pool — an enquiry no one represents becomes `no_match` rather than being sent
// to unrelated agents. See rankCandidates for the tier definitions.
//
// Country is a hard eligibility gate (see rankCandidates), which makes two bits
// of data load-bearing rather than merely nice-to-have:
//   - Country: an enquiry whose student country cannot be resolved (neither
//     `country_of_residence_id` nor `nationality_id` set), or a directory row with
//     a NULL `country_code`, matches NOTHING. Only the institution-direct
//     fallback can still produce a recipient in that case.
//   - Coordinates: distance splits T1/T2/T3, so a missing
//     `enquiry_match_directory.latitude/longitude` or student
//     `platform_user_profiles.latitude/longitude` puts the candidate in T3. With
//     coordinates unpopulated across the board every verified same-country rep
//     collapses into T3 — still matched and still ahead of T4, just unordered.
//
// GAP (flagged, not invented): re-enquiry exclusion ("businesses the student
// already unlocked for the same institution/course are excluded") is not
// implemented here — ponytail: out of scope for this phase's tests, add a
// `whereNotIn` against prior unlocked distributions for this student+job when
// that becomes a real requirement.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { logEnquiryAudit } from "../shared/audit.js";
import * as distributionsRepo from "../repositories/distributions.repository.js";
import * as representationsRepo from "../repositories/representations.repository.js";
import * as emailQueueService from "./email-queue.service.js";
import { syncDistributionToTenant } from "./tenant-sync.service.js";

export const MAX_DISTRIBUTIONS = Number(process.env.ENQUIRY_MAX_DISTRIBUTIONS) || 6;

// Distance bands that split the verified/same-country tiers (T1-T3).
export const TIER_1_MAX_KM = 20;
export const TIER_2_MAX_KM = 40;

/** T1 <20km, T2 20-40km, T3 >=40km — unknown distance falls to T3. */
function distanceBand(distanceKm: number | null): 1 | 2 | 3 {
  if (distanceKm == null) return 3;
  if (distanceKm < TIER_1_MAX_KM) return 1;
  if (distanceKm < TIER_2_MAX_KM) return 2;
  return 3;
}

interface DirectoryCandidate {
  business_id: number;
  /** Which active representation made this business eligible — recorded on the
   * distribution row so a match is always traceable back to its cause. */
  representation_id?: string | null;
  subject_area: string | null;
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | string | null;
  longitude: number | string | null;
  is_institution_contact: boolean;
}

interface RankedCandidate extends DirectoryCandidate {
  tier: number;
  distance_km: number | null;
}

/** Haversine distance in km, or null if either point is missing. */
function distanceKm(
  lat1: number | string | null,
  lon1: number | string | null,
  lat2: number | string | null,
  lon2: number | string | null,
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  // pg returns `decimal` columns as strings — coerce before doing math.
  lat1 = Number(lat1);
  lon1 = Number(lon1);
  lat2 = Number(lat2);
  lon2 = Number(lon2);
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Pure tiering function (no DB access) — 4 tiers, all restricted to the
 * student's own country:
 *
 *   T1  verified reps, same country, <20km
 *   T2  verified reps, same country, 20-40km
 *   T3  verified reps, same country, >=40km or distance unknown
 *   T4  unverified reps, same country (any distance)
 *
 * Same country is a hard gate: a rep in any other country is never a recipient,
 * so cross-border agents are out of scope for matching entirely. T4 has no
 * distance bands — an unverified rep ranks below every verified one regardless
 * of how close it is, and distance only orders T4 internally.
 *
 * Unknown distance falls to T3 rather than being guessed into a nearer band: a
 * business with no coordinates is not evidence of proximity. Note this makes
 * coordinates load-bearing — see the note at the top of this file.
 *
 * `repCandidates` are directory rows for businesses holding an active
 * representation for this enquiry's course or institution — the only businesses
 * eligible at all.
 */
export function rankCandidates(opts: {
  repCandidates: DirectoryCandidate[];
  studentCountryCode: string | null;
  studentLat: number | string | null;
  studentLon: number | string | null;
  maxDistributions: number;
}): RankedCandidate[] {
  const { repCandidates, studentCountryCode, studentLat, studentLon, maxDistributions } = opts;

  const withDistance = (c: DirectoryCandidate): RankedCandidate => ({
    ...c,
    tier: 0,
    distance_km: distanceKm(studentLat, studentLon, c.latitude, c.longitude),
  });

  const sameCountry = (c: DirectoryCandidate) =>
    !!studentCountryCode && !!c.country_code && c.country_code === studentCountryCode;

  const augmented = repCandidates.map(withDistance);

  // `verification_status` has no CHECK constraint, so anything other than
  // 'verified' (e.g. 'pending') must fall through to the unverified tiers rather
  // than matching no bucket and dropping out of the ranking entirely.
  const isVerified = (c: DirectoryCandidate) => c.verification_status === "verified";

  // Same country is a hard eligibility gate, not just a tier: a rep outside the
  // student's country never receives the enquiry, verified or not. Note this
  // means a student with no resolvable country code matches NOBODY — only the
  // institution-direct fallback below can still produce a recipient.
  const verifiedSameCountry = augmented.filter((c) => isVerified(c) && sameCountry(c));
  const unverifiedSameCountry = augmented.filter((c) => !isVerified(c) && sameCountry(c));

  const byDistanceAsc = (a: RankedCandidate, b: RankedCandidate) => {
    if (a.distance_km == null && b.distance_km == null) return 0;
    if (a.distance_km == null) return 1;
    if (b.distance_km == null) return -1;
    return a.distance_km - b.distance_km;
  };

  const tiered: RankedCandidate[] = [];
  // Sorting by distance ascending (nulls last) already emits the bands in
  // tier order, since band 3 is both the farthest and where nulls land.
  for (const c of verifiedSameCountry.sort(byDistanceAsc)) tiered.push({ ...c, tier: distanceBand(c.distance_km) });
  for (const c of unverifiedSameCountry.sort(byDistanceAsc)) tiered.push({ ...c, tier: 4 });

  return tiered.slice(0, maxDistributions);
}

/**
 * Student country for the country-match tiers: residence first, then nationality
 * as a fallback (PRD Flow B step 2). Residence wins because agents are matched
 * on where the student actually is, not where they hold citizenship; nationality
 * is only consulted when residence is unset, which is common on thin profiles.
 */
async function resolveGeography(enquiry: any) {
  const existing: string | null = enquiry.student_country_code ?? null;
  if (existing) return existing;

  const profile = await masterKnex("platform_user_profiles as p")
    .leftJoin("countries as residence", "p.country_of_residence_id", "residence.id")
    .leftJoin("countries as nationality", "p.nationality_id", "nationality.id")
    .where("p.user_id", enquiry.student_id)
    .first("residence.iso2 as residence_code", "nationality.iso2 as nationality_code");

  return profile?.residence_code ?? profile?.nationality_code ?? null;
}

/**
 * Institution-direct fallback (PRD §12): if the enquiry's institution has a
 * business acting as its sole contact (`is_institution_contact = true` in the
 * directory, scoped to this institution via an active `representations` row —
 * the directory table itself carries no job_id column), that business becomes
 * the sole recipient.
 */
async function findInstitutionFallback(
  extractionJobId: string,
): Promise<{ business_id: number; representation_id: string } | null> {
  const row = await masterKnex("enquiry_match_directory as emd")
    .join("representations as r", function () {
      this.on("r.business_id", "=", "emd.business_id").andOn("r.extraction_job_id", "=", masterKnex.raw("?", [extractionJobId]));
    })
    .where("emd.is_institution_contact", true)
    .where("emd.is_suspended", false)
    .where("r.status", "active")
    .whereNull("r.deleted_at")
    .first("emd.business_id", "r.id as representation_id");
  return row ? { business_id: Number(row.business_id), representation_id: row.representation_id } : null;
}

export async function runMatching(enquiryId: string): Promise<void> {
  const enquiry = await masterKnex("enquiries").where({ id: enquiryId }).first();
  if (!enquiry) return;
  if (enquiry.status !== "pending") return; // already matched — idempotency guard
  await matchAndCommit(enquiry, []);
}

async function matchAndCommit(enquiry: any, excludeBusinessIds: number[]): Promise<void> {
  const excluded = new Set(excludeBusinessIds);
  const enquiryId = enquiry.id;

  // Direct-target short circuit (PRD §12): student enquired to a specific
  // business directly, matching is skipped entirely. If that one business is
  // already excluded (it's the one that just rejected), there's nowhere else
  // to go — falls through to no_match below.
  if (enquiry.business_id != null) {
    if (excluded.has(enquiry.business_id)) {
      await markNoMatch(enquiryId, enquiry.student_id, null);
      return;
    }
    await commitDistributions(enquiry, [
      { business_id: enquiry.business_id, tier: 1, distance_km: null } as RankedCandidate,
    ]);
    return;
  }

  // The course's subject area is no longer read: eligibility comes purely from
  // `representations`, so there is nothing to subject-match against.
  const studentCountryCode = await resolveGeography(enquiry);

  const directoryRows: DirectoryCandidate[] = await masterKnex("enquiry_match_directory")
    .where("is_suspended", false)
    .select("business_id", "subject_area", "country_code", "verification_status", "latitude", "longitude", "is_institution_contact");

  const notExcluded = (r: DirectoryCandidate) => !excluded.has(r.business_id);

  // Tiers 1-6 are "institution reps" (PRD §12): businesses holding an ACTIVE
  // representation for this enquiry's institution or course. Previously this was
  // approximated by comparing directory subject_area strings, which let a
  // business that represented nothing related to the enquiry be treated as a
  // rep — e.g. a Computer Science consultancy receiving a Cornell food-industry
  // enquiry. The representations table is the actual source of truth for
  // "who represents what", so it gates the pool now.
  const representationByBusiness = new Map(
    (
      await representationsRepo.findRepresentingBusinesses({
        extractionJobId: enquiry.extraction_job_id ?? null,
        courseId: enquiry.course_id ?? null,
      })
    ).map((r) => [r.business_id, r.representation_id]),
  );

  // NOT filtered on is_institution_contact: under the sole-representer rule a
  // business earns that flag by being an institution's only representer, and it
  // is still an agent — excluding it here dropped the one business that actually
  // represents the institution while a subject-matched general agent got the
  // enquiry instead. The flag only makes it *additionally* eligible for the
  // last-resort fallback below.
  const repCandidates = directoryRows
    .filter((r) => representationByBusiness.has(r.business_id) && notExcluded(r))
    .map((r) => ({ ...r, representation_id: representationByBusiness.get(r.business_id)! }));

  let selected = rankCandidates({
    repCandidates,
    studentCountryCode,
    studentLat: enquiry.student_latitude,
    studentLon: enquiry.student_longitude,
    maxDistributions: MAX_DISTRIBUTIONS,
  });

  if (selected.length === 0 && enquiry.extraction_job_id) {
    const fallback = await findInstitutionFallback(enquiry.extraction_job_id);
    if (fallback != null && !excluded.has(fallback.business_id)) {
      selected = [
        {
          business_id: fallback.business_id,
          representation_id: fallback.representation_id,
          tier: 1,
          distance_km: null,
        } as RankedCandidate,
      ];
    }
  }

  if (selected.length === 0) {
    await markNoMatch(enquiryId, enquiry.student_id, studentCountryCode);
    return;
  }

  await commitDistributions(enquiry, selected, studentCountryCode);
}

async function markNoMatch(enquiryId: string, studentId: number, studentCountryCode: string | null) {
  await masterKnex.transaction(async (trx) => {
    await trx("enquiries")
      .where({ id: enquiryId })
      .update({
        status: "no_match",
        ...(studentCountryCode !== null ? { student_country_code: studentCountryCode } : {}),
        updated_at: trx.fn.now(),
      });
    await logEnquiryAudit(studentId, "enquiry.no_match", {
      entityType: "enquiry",
      entityId: enquiryId,
      trx,
      details: { old_status: "pending", new_status: "no_match" },
    });
  });
}

async function commitDistributions(
  enquiry: any,
  selected: RankedCandidate[],
  studentCountryCode?: string | null,
) {
  const rows: distributionsRepo.NewDistribution[] = selected.map((c, idx) => ({
    enquiry_id: enquiry.id,
    business_id: c.business_id,
    representation_id: c.representation_id ?? null,
    tier: c.tier,
    match_rank: idx + 1,
    match_distance_km: c.distance_km,
  }));

  const inserted = await masterKnex.transaction(async (trx: Knex.Transaction) => {
    const insertedRows = await distributionsRepo.insertMany(trx, rows);

    const [{ count }] = await trx("enquiry_distributions").where({ enquiry_id: enquiry.id }).count("id");

    await trx("enquiries")
      .where({ id: enquiry.id })
      .update({
        status: "distributed",
        ...(studentCountryCode !== undefined ? { student_country_code: studentCountryCode } : {}),
        distribution_count: Number(count),
        last_distributed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    await logEnquiryAudit(enquiry.student_id, "enquiry.distributed", {
      entityType: "enquiry",
      entityId: enquiry.id,
      trx,
      details: { business_ids: rows.map((r) => r.business_id), old_status: "pending", new_status: "distributed" },
    });

    return insertedRows;
  });

  // Fire-and-forget per PRD §17 ("never blocking distribution") — each business's
  // tenant write is independent, so run them concurrently and never let one
  // failure block the others or the caller.
  await Promise.allSettled(
    inserted.map((row) => syncDistributionToTenant(row.business_id, row.enquiry_id, row.id)),
  );

  // Fire-and-forget per PRD §17 ("never blocking distribution") — enqueue is
  // itself dedup-safe, so a failure here never re-runs matching/insert.
  for (const row of inserted) {
    await emailQueueService.enqueueDistributionEmails(row.enquiry_id, row.id, row.business_id).catch(() => {});
  }
}
