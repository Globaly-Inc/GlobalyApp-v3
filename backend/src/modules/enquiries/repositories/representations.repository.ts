// Representation lookup for the matcher — reads `business_representations`, the same table the
// Partners tab writes. There is no enquiry-private representations table any more: linking a
// partner IS what makes a business eligible for that institution's enquiries.
//
// Institution-level only. `business_representations` has no course column, so a representation
// covers every course at its target institution. Course-scoped precision was dropped with the
// old `representations` table (see 20260830_002).

import { masterKnex } from "../../../core/db/master-pool.js";

export interface RepresentingBusiness {
  business_id: number;
  /** `business_representations.uuid` — recorded on the distribution so a match stays traceable. */
  representation_id: string;
  /** `countries.iso2`, uppercased. NULL matches nobody: country is a hard gate in rankCandidates. */
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | string | null;
  longitude: number | string | null;
}

/**
 * Businesses eligible to receive this institution's enquiries, with the attributes rankCandidates
 * tiers on. One query instead of the old scan-the-directory-then-intersect pair.
 *
 * The UNIQUE on (originator_id, originator_type, target_id, target_type) guarantees at most one
 * row per business, so no DISTINCT ON is needed — and the old bug where a business with N
 * directory rows became N candidates and filled every slot cannot recur.
 *
 * Gates, in the order they matter:
 *   - the link is live: status 'active', not soft-deleted, and INSIDE its valid_from/valid_until
 *     window. That window is stored and editable in the Partners UI and was previously ignored by
 *     every reader; honouring it here is the point of having it.
 *   - the business can take leads: not soft-deleted, enquiry_enabled, not suspended.
 *
 * `country_ids` is deliberately NOT a gate. Its UI is commented out in link-consultancy-dialog,
 * so every row stores `[]`, and treating empty as "serves nowhere" would match nobody at all.
 */
export async function findRepresentingBusinesses(institutionId: number): Promise<RepresentingBusiness[]> {
  const rows = await masterKnex("business_representations as br")
    .join("businesses as b", "b.id", "br.originator_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where({
      "br.originator_type": "business",
      "br.target_type": "institution",
      "br.target_id": institutionId,
      "br.status": "active",
    })
    .whereNull("br.deleted_at")
    .where((qb) => qb.whereNull("br.valid_from").orWhere("br.valid_from", "<=", masterKnex.fn.now()))
    .where((qb) => qb.whereNull("br.valid_until").orWhere("br.valid_until", ">=", masterKnex.fn.now()))
    .whereNull("b.deleted_at")
    .where("b.enquiry_enabled", true)
    .whereNot("b.status", "suspended")
    .select(
      "b.id as business_id",
      "br.uuid as representation_id",
      masterKnex.raw("upper(c.iso2) as country_code"),
      // `businesses.status` has no CHECK constraint, so anything that isn't exactly 'verified'
      // must land in the unverified tiers rather than in no bucket at all.
      masterKnex.raw("CASE WHEN b.status = 'verified' THEN 'verified' ELSE 'unverified' END as verification_status"),
      "b.latitude",
      "b.longitude",
    );

  return rows.map((r) => ({ ...r, business_id: Number(r.business_id) })) as RepresentingBusiness[];
}
