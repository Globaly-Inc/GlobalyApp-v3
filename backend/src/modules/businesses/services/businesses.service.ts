// Business service — registration (provisions DB + creates agent owner), profile management.

import { randomBytes } from "node:crypto";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { buildConnString } from "../../../core/db/knex.js";
import { provisionBusinessDb } from "../../../core/business/provisioner.js";
import * as repo from "../repositories/businesses.repository.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { BusinessRegisterInput, BusinessProfilePatchInput } from "../schemas/businesses.schema.js";
import type { BusinessRecord } from "../../../core/types.js";

const logger = createChildLogger("businesses-service");

/**
 * Register a business — creates business record, provisions DB with agents table,
 * creates agent owner in the new business DB.
 */
export async function registerBusiness(input: BusinessRegisterInput) {
  const existing = await repo.findBusinessBySubdomain(input.subdomain);
  if (existing) throw new ConflictError("Subdomain already taken");

  const dbPassword = randomBytes(16).toString("hex");
  const business = await repo.insertBusiness({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    subdomain: input.subdomain,
    business_name: input.business_name,
    db_username: `user_${input.subdomain}`,
    db_password: dbPassword,
    account_status: 0,
    business_type: input.business_type,
    description: input.description,
    phone: input.phone,
    country_id: input.country_id,
    state: input.state,
    city: input.city,
    address: input.address,
    postcode: input.postcode,
    registration_licenses: input.registration_licenses,
  });

  try {
    await provisionBusinessDb(business.db_name);
  } catch (err) {
    await repo.updateBusinessStatus(business.id, -1);
    throw err;
  }

  // Create owner agent in the new business DB
  const db = getKnex(business.id, buildConnString(business));
  const ownerRole = await db("roles").where({ name: "owner" }).first();
  await db("agents").insert({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    username: input.email,
    role_id: ownerRole.id,
    account_status: 1,
    is_owner: true,
  });

  await repo.updateBusinessStatus(business.id, 1);

  logger.info("Business registered", { orgId: business.id, subdomain: input.subdomain });

  return {
    org: { id: business.id, subdomain: business.subdomain, business_name: business.business_name },
    message: "Registration successful. Use agent OTP login with your subdomain to access.",
  };
}

/** Get full business record. */
export async function getProfile(businessId: string) {
  const business = await repo.findBusinessById(businessId);
  if (!business) throw new NotFoundError("Business not found");
  return business;
}

/** Update business profile fields. */
export async function updateProfile(businessId: string, data: BusinessProfilePatchInput) {
  const existing = await repo.findBusinessById(businessId);
  if (!existing) throw new NotFoundError("Business not found");
  return repo.updateBusinessProfile(businessId, data);
}
