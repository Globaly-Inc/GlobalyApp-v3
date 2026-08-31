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
// `business_representations` is the ONLY filter on who receives an enquiry: a
// business must hold a live, in-window representation of the enquiry's
// institution — the same row the Partners tab writes. Representations are
// institution-level, so one covers every course there. There is no
// general/subject-matched fallback pool — an enquiry no one represents becomes
// `no_match` rather than being sent to unrelated agents. See rankCandidates for
// the tier definitions.
//
// Country is a hard eligibility gate (see rankCandidates), which makes two bits
// of data load-bearing rather than merely nice-to-have:
//   - Country: an enquiry whose student country cannot be resolved (neither
//     `country_of_residence_id` nor `nationality_id` set), or a business with no
//     `country_id`, matches NOTHING. Only the institution-direct fallback can
//     still produce a recipient in that case.
//   - Coordinates: distance splits T1/T2/T3, so a missing
//     `businesses.latitude/longitude` or student
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
import { syncDistributionToTenant, syncInstitutionDistributionToTenant } from "./tenant-sync.service.js";

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

/** A candidate as the ranker sees it — a representing business plus its ranking attributes. */
type Candidate = Omit<representationsRepo.RepresentingBusiness, "representation_id"> & {
  /** Which representation made this business eligible — recorded on the distribution row so a
   * match is always traceable back to its cause. Absent on the direct-target short circuit. */
  representation_id?: string | null;
};

interface RankedCandidate extends Candidate {
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
 * `repCandidates` are the businesses holding a live representation of this
 * enquiry's institution — the only businesses eligible at all.
 */
export function rankCandidates(opts: {
  repCandidates: Candidate[];
  studentCountryCode: string | null;
  studentLat: number | string | null;
  studentLon: number | string | null;
  maxDistributions: number;
}): RankedCandidate[] {
  const { repCandidates, studentCountryCode, studentLat, studentLon, maxDistributions } = opts;

  const withDistance = (c: Candidate): RankedCandidate => ({
    ...c,
    tier: 0,
    distance_km: distanceKm(studentLat, studentLon, c.latitude, c.longitude),
  });

  const sameCountry = (c: Candidate) =>
    !!studentCountryCode && !!c.country_code && c.country_code === studentCountryCode;

  const augmented = repCandidates.map(withDistance);

  // `verification_status` has no CHECK constraint, so anything other than
  // 'verified' (e.g. 'pending') must fall through to the unverified tiers rather
  // than matching no bucket and dropping out of the ranking entirely.
  const isVerified = (c: Candidate) => c.verification_status === "verified";

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

  // The course's subject area is not read: eligibility comes purely from
  // `business_representations`, so there is nothing to subject-match against.
  const studentCountryCode = await resolveGeography(enquiry);

  // The whole candidate pool, ranking attributes included, in one query. An enquiry with no
  // resolved institution (its job was promoted to a business, not an institution) has nobody to
  // match against and falls through to the institution fallback and then no_match.
  const repCandidates = (
    enquiry.institution_id != null
      ? await representationsRepo.findRepresentingBusinesses(Number(enquiry.institution_id))
      : []
  ).filter((c) => !excluded.has(c.business_id));

  const selected = rankCandidates({
    repCandidates,
    studentCountryCode,
    studentLat: enquiry.student_latitude,
    studentLon: enquiry.student_longitude,
    maxDistributions: MAX_DISTRIBUTIONS,
  });

  // One last-resort path: the institution that owns the course takes the lead itself.
  //
  // There used to be a second — an agent flagged `is_institution_contact` for being an
  // institution's SOLE representer. It is gone with the match directory, and nothing is lost:
  // a sole representer is now simply the only member of the pool above, ranked normally. The
  // one case the flag uniquely covered was a sole representer that FAILS the country gate
  // taking the lead anyway, which is the wrong-routing this comment used to describe.
  if (selected.length === 0 && (await commitInstitutionFallback(enquiry, studentCountryCode))) return;

  if (selected.length === 0) {
    await markNoMatch(enquiryId, enquiry.student_id, studentCountryCode);
    return;
  }

  await commitDistributions(enquiry, selected, studentCountryCode);
}

/**
 * Sends the enquiry to `enquiries.institution_id` — the institution the course was extracted
 * from — as a single distribution with no business behind it.
 *
 * Returns false when there is nothing to fall back to (the course's job was promoted to a
 * business rather than an institution, so institution_id is NULL, or the row is gone). The caller
 * then marks no_match exactly as before.
 *
 * Tier 4: an institution is not a ranked, verified, nearby representative — it is the bottom of
 * the ladder by definition, and the tier is what the admin screen reads to explain a match.
 *
 * An unclaimed institution is still a valid recipient. It gets the mail with a claim CTA, and the
 * distribution waits for it — which is why this does not gate on account_status.
 *
 * It does gate on there being someone to send that CTA to. Promote leaves `institutions.email`
 * NULL when extraction found no address, or when another institution already holds it; unclaimed,
 * such a row also has no members and no tenant schema. Distributing to it would flip the enquiry
 * to 'distributed' with no mail, no tenant row and no way to claim — the student would be waiting
 * on a lead nobody can open. Returning false instead lets the caller try the agent fallback and
 * then no_match, which is at least honest. Recipients come from the email service so the two
 * cannot disagree about who is reachable.
 */
async function commitInstitutionFallback(enquiry: any, studentCountryCode: string | null): Promise<boolean> {
  const institutionId: number | null = enquiry.institution_id ?? null;
  if (institutionId == null) return false;

  // Also covers "institution missing or soft-deleted" — that returns no recipients.
  const { recipients } = await emailQueueService.resolveInstitutionRecipients(institutionId);
  if (recipients.length === 0) return false;

  // No ON CONFLICT: matching only ever runs on a 'pending' enquiry and flips the status in this
  // same transaction, so a second run cannot reach the insert. The partial unique index on
  // (enquiry_id, institution_id) is what would catch it if that guard were ever bypassed.
  const row = await masterKnex.transaction(async (trx: Knex.Transaction) => {
    const [inserted] = await trx("enquiry_distributions")
      .insert({
        enquiry_id: enquiry.id,
        business_id: null,
        institution_id: institutionId,
        representation_id: null,
        tier: 4,
        match_rank: 1,
        match_distance_km: null,
        status: "distributed",
      })
      .returning("*");

    await trx("enquiries")
      .where({ id: enquiry.id })
      .update({
        status: "distributed",
        ...(studentCountryCode !== null ? { student_country_code: studentCountryCode } : {}),
        distribution_count: 1,
        last_distributed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    await logEnquiryAudit(enquiry.student_id, "enquiry.distributed", {
      entityType: "enquiry",
      entityId: enquiry.id,
      trx,
      details: {
        institution_id: institutionId,
        institution_fallback: true,
        old_status: "pending",
        new_status: "distributed",
      },
    });

    return inserted;
  });

  // Both fire-and-forget, per PRD §17 — never blocking distribution.
  await syncInstitutionDistributionToTenant(institutionId, enquiry.id, row.id).catch(() => {});
  await emailQueueService.enqueueInstitutionFallbackEmail(enquiry.id, row.id, institutionId).catch(() => {});

  return true;
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
