// Business repository — CRUD on businesses table in globalyapp.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";

export async function findBusinessBySubdomain(subdomain: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ subdomain }).whereNull("deleted_at").first();
}

export async function findBusinessById(id: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ id }).whereNull("deleted_at").first();
}

export async function findBusinessByDbName(dbName: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ schema_name: dbName }).whereNull("deleted_at").first();
}


/**
 * One row per selectable org. `kind` is not decoration: businesses and institutions are separate
 * tables with colliding id spaces, so a bare id is ambiguous and whatever stores the pick has to
 * store the kind alongside it — the same reason enquiry_distributions models a recipient as two
 * nullable columns and listRelations returns `partner_kind`.
 */
export type OrgSearchResult = {
  kind: "business" | "institution";
  id: number;
  business_name: string;
  logo_url: string | null;
};

/**
 * Institutions are opt-in rather than always included: this endpoint also backs the branch
 * picker, whose `business_branches.linked_business_id` is an app-level FK to businesses.id with
 * no kind column. Returning institutions there by default would let someone link one and write
 * an id that silently resolves to a different business.
 *
 * Neither half gates on published/verified status — the businesses half never has, and a
 * consultancy declaring which institution it represents needs the promoted-but-unclaimed ones,
 * which are exactly the ones `is_published` excludes.
 */
export async function searchBusinesses(
  search: string | undefined,
  excludeId: string | undefined,
  limit: number,
  includeInstitutions = false,
): Promise<OrgSearchResult[]> {
  const businesses = masterKnex<BusinessRecord>("businesses")
    .select(masterKnex.raw("'business' as kind"), "id", "business_name", "logo_url")
    .whereNull("deleted_at")
    .orderBy("business_name")
    .limit(limit);
  if (excludeId) businesses.whereNot("id", excludeId);
  if (search) businesses.whereILike("business_name", `%${search}%`);
  if (!includeInstitutions) return businesses as unknown as Promise<OrgSearchResult[]>;

  // `institution_name as business_name`: one label column for two tables, the convention
  // listRelations already uses (COALESCE(business_name, institution_name) as partner_name), so
  // the picker renders both without branching on kind.
  //
  // excludeId is deliberately NOT applied here. It exists to keep the caller's own business out
  // of its own partner list, and ids collide across the tables — applying it would drop an
  // unrelated institution that happens to share the number.
  const institutions = masterKnex("institutions")
    .select(masterKnex.raw("'institution' as kind"), "id", "institution_name as business_name", "logo_url")
    .whereNull("deleted_at")
    .orderBy("institution_name")
    .limit(limit);
  if (search) institutions.whereILike("institution_name", `%${search}%`);

  // Merged in JS rather than as a SQL UNION: `limit` is capped at 50, and one ordered list out
  // of two ordered lists is not worth a subquery wrapper to get ORDER BY/LIMIT applied to the
  // union rather than to its last branch.
  const [bizRows, instRows] = await Promise.all([businesses, institutions]);
  return [...(bizRows as unknown as OrgSearchResult[]), ...(instRows as OrgSearchResult[])]
    .sort((a, b) => a.business_name.localeCompare(b.business_name))
    .slice(0, limit);
}

export async function insertBusiness(data: {
  owner_id: number;
  subdomain: string;
  business_name: string;
  account_status: number;
  business_type?: string | null;
  business_category_id?: number | null;
  description?: string | null;
  phone?: string | null;
  country_id?: number | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  postcode?: string | null;
  registration_licenses?: Record<string, unknown> | null;
  claim_status?: string;
}): Promise<BusinessRecord> {
  const [row] = await masterKnex<BusinessRecord>("businesses").insert(data).returning("*");
  return row;
}

export async function deleteBusiness(id: string): Promise<void> {
  await masterKnex("businesses").where({ id }).delete();
}

export async function updateBusinessStatus(id: string, accountStatus: number): Promise<void> {
  await masterKnex("businesses").where({ id }).update({ account_status: accountStatus, updated_at: masterKnex.fn.now() });
}

export async function updateBusinessProfile(id: string, data: Record<string, unknown>): Promise<BusinessRecord> {
  const [row] = await masterKnex<BusinessRecord>("businesses")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function appendBusinessMedia(
  id: string,
  column: "gallery_images" | "video_urls",
  storagePath: string,
): Promise<void> {
  await masterKnex("businesses")
    .where({ id })
    .update({
      [column]: masterKnex.raw("array_append(coalesce(??, ARRAY[]::text[]), ?)", [column, storagePath]),
      updated_at: masterKnex.fn.now(),
    });
}

export async function removeBusinessMedia(
  id: string,
  column: "gallery_images" | "video_urls",
  storagePath: string,
): Promise<void> {
  await masterKnex("businesses")
    .where({ id })
    .update({
      [column]: masterKnex.raw("array_remove(??, ?)", [column, storagePath]),
      updated_at: masterKnex.fn.now(),
    });
}

export async function findByClaimToken(token: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ claim_token: token }).whereNull("deleted_at").first();
}


export async function findUnclaimedBusinessByContactEmail(email: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses")
    .whereRaw("lower(email) = lower(?)", [email])
    .whereNot("claim_status", "claimed")
    .whereNull("deleted_at")
    .first();
}

export async function setClaimPending(id: string | number, token: string, expiresAt: Date): Promise<void> {
  await masterKnex("businesses")
    .where({ id: String(id) })
    .update({ claim_token: token, claim_token_expires_at: expiresAt, claim_status: "claim_pending", updated_at: masterKnex.fn.now() });
}

export async function clearClaim(id: string | number): Promise<BusinessRecord> {
  const [row] = await masterKnex<BusinessRecord>("businesses")
    .where({ id: String(id) })
    .update({
      claim_token: null,
      claim_token_expires_at: null,
      claim_status: "claimed",
      updated_at: masterKnex.fn.now(),
    })
    .returning("*");
  return row;
}
