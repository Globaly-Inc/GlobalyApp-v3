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


export async function searchBusinesses(
  search: string | undefined,
  excludeId: string,
  limit: number,
): Promise<Pick<BusinessRecord, "id" | "business_name" | "logo_url">[]> {
  const query = masterKnex<BusinessRecord>("businesses")
    .select("id", "business_name", "logo_url")
    .whereNull("deleted_at")
    .whereNot("id", excludeId)
    .orderBy("business_name")
    .limit(limit);
  if (search) query.whereILike("business_name", `%${search}%`);
  return query;
}

export async function insertBusiness(data: {
  owner_id: number;
  subdomain: string;
  business_name: string;
  account_status: number;
  business_type?: string | null;
  description?: string | null;
  phone?: string | null;
  country_id?: number | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  postcode?: string | null;
  registration_licenses?: Record<string, unknown> | null;
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

export async function findByClaimToken(token: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ claim_token: token }).whereNull("deleted_at").first();
}

/** The business a platform_user owns that they haven't finished claiming yet (pre-seeded by an admin). */
export async function findUnclaimedBusinessByOwnerId(ownerId: number): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses")
    .where({ owner_id: ownerId })
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
