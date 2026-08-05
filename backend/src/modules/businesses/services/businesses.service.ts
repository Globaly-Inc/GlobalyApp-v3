// Business service — setup (provisions DB + creates agent owner), profile management.

import { randomBytes } from "node:crypto";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { buildConnString } from "../../../core/db/knex.js";
import { provisionBusinessDb } from "../../../core/business/provisioner.js";
import * as repo from "../repositories/businesses.repository.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { BusinessRegisterInput, BusinessProfilePatchInput } from "../schemas/businesses.schema.js";

const logger = createChildLogger("businesses-service");

/**
 * Register a business — owner details come from the authenticated platform_user.
 * Creates business record, provisions DB with agents table, creates owner agent.
 */
export async function registerBusiness(userId: number, input: BusinessRegisterInput) {
  const user = await userRepo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  const dbPassword = randomBytes(16).toString("hex");

  // Insert directly — let DB unique constraint handle races instead of check-then-insert
  let business;
  try {
    business = await repo.insertBusiness({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
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
  } catch (err: any) {
    if (err.code === "23505") throw new ConflictError("Subdomain already taken");
    throw err;
  }

  try {
    await provisionBusinessDb(business.db_name);
  } catch (err) {
    // Clean up — don't leave orphaned rows with a dead subdomain
    await repo.deleteBusiness(business.id);
    throw err;
  }

  // Create owner agent in the new business DB
  const db = await getKnex(business.id, buildConnString(business));
  const ownerRole = await db("roles").where({ name: "owner" }).first();
  await db("agents").insert({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    username: user.email,
    role_id: ownerRole.id,
    account_status: 1,
    is_owner: true,
  });

  await repo.updateBusinessStatus(business.id, 1);

  logger.info("Business registered", { orgId: business.id, subdomain: input.subdomain, userId });

  return {
    org: { id: business.id, subdomain: business.subdomain, business_name: business.business_name },
    message: "Business created. Use agent OTP login with your subdomain to manage it.",
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
