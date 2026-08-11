// Match directory repository — globalyapp.enquiry_match_directory.
// No unique constraint on business_id (PRD §8.2): a business can legitimately
// need one row per subject_area it represents, so a "sync" is a full
// delete-then-insert of that business's rows, not a per-row upsert.

import { masterKnex } from "../../../core/db/master-pool.js";

const T = "enquiry_match_directory";

export interface MatchDirectoryRow {
  business_id: number;
  subject_area: string | null;
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | null;
  longitude: number | null;
  is_suspended: boolean;
  is_institution_contact: boolean;
}

export async function listByBusiness(businessId: number) {
  return masterKnex(T).where({ business_id: businessId });
}

/**
 * Replaces every enquiry_match_directory row for `businessId` with `rows`,
 * atomically. Passing an empty array clears the business out of the routing
 * index entirely (e.g. it has no active representations left).
 */
export async function replaceForBusiness(businessId: number, rows: MatchDirectoryRow[]): Promise<void> {
  await masterKnex.transaction(async (trx) => {
    await trx(T).where({ business_id: businessId }).delete();
    if (rows.length > 0) {
      await trx(T).insert(rows.map((r) => ({ ...r, synced_at: trx.fn.now() })));
    }
  });
}
