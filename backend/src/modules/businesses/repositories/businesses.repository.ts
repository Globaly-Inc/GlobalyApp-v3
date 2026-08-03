// Business repository — CRUD on businesses table in globalyapp.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";

export async function findBusinessBySubdomain(subdomain: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ subdomain }).first();
}

export async function findBusinessById(id: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ id }).first();
}

export async function insertBusiness(data: {
  first_name: string;
  last_name: string;
  email: string;
  subdomain: string;
  business_name: string;
  db_username: string;
  db_password: string;
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
