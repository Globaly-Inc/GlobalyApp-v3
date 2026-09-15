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

/**
 * Stores a FRESH claim token, replacing whatever was there. For a deliberate resend, where the
 * point may well be to invalidate a link that went astray.
 *
 * Guarded on `claim_status`: a listing someone has already claimed must never be walked back to
 * `claim_pending`, which would both re-open it and flip it back onto the acquisition mail.
 */
export async function setClaimPending(id: string | number, token: string, expiresAt: Date): Promise<void> {
  await masterKnex("businesses")
    .where({ id: String(id) })
    .whereNot("claim_status", "claimed")
    .update({ claim_token: token, claim_token_expires_at: expiresAt, claim_status: "claim_pending", updated_at: masterKnex.fn.now() });
}

/**
 * Returns the token a claim link should carry, minting one only when there isn't a live one.
 *
 * There is a single `claim_token` column, so minting unconditionally invalidated every link
 * already sitting in the recipient's inbox. An unclaimed business can be matched by an enquiry
 * every day; each one used to kill yesterday's acquisition mail, so the button failed as
 * "invalid or already used" well inside the 72 hours the mail implies.
 *
 * A live token keeps BOTH its value and its original expiry — reusing it must not silently
 * extend the lifetime the earlier mail was sent under. An absent or expired one is replaced.
 *
 * Returns null when the listing is already claimed (the `whereNot` matches nothing), which is
 * the caller's signal that it raced a claim and should send the lead notice instead.
 */
export async function ensureClaimToken(
  id: string | number,
  token: string,
  expiresAt: Date,
): Promise<string | null> {
  const live = "claim_token IS NOT NULL AND claim_token_expires_at > now()";
  const [row] = await masterKnex("businesses")
    .where({ id: String(id) })
    .whereNot("claim_status", "claimed")
    .update({
      claim_token: masterKnex.raw(`CASE WHEN ${live} THEN claim_token ELSE ? END`, [token]),
      claim_token_expires_at: masterKnex.raw(
        `CASE WHEN ${live} THEN claim_token_expires_at ELSE ? END`,
        [expiresAt],
      ),
      claim_status: "claim_pending",
      updated_at: masterKnex.fn.now(),
    })
    .returning("claim_token");
  return (row as { claim_token?: string } | undefined)?.claim_token ?? null;
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
