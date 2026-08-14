// Business service — registration (provisions schema + creates owner agent), profile management.

import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { provisionBusinessSchema } from "../../../core/business/provisioner.js";
import * as repo from "../repositories/businesses.repository.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";
import { issueScopedAccessToken } from "../../auth/auth.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { BusinessRegisterInput, BusinessProfilePatchInput } from "../schemas/businesses.schema.js";

const logger = createChildLogger("businesses-service");

/**
 * Register a business — owner is the authenticated platform_user.
 * Creates business record, provisions schema (biz_{id}), creates owner agent.
 */
export async function registerBusiness(userId: number, input: BusinessRegisterInput) {
  const user = await userRepo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  let business;
  try {
    business = await repo.insertBusiness({
      owner_id: userId,
      subdomain: input.subdomain,
      business_name: input.business_name,
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
    await provisionBusinessSchema(business.schema_name);
  } catch (err) {
    await repo.deleteBusiness(business.id);
    throw err;
  }

  // Create owner agent in the business schema
  const db = await getKnex(business.id, schemaName(business.schema_name));
  const ownerRole = await db("roles").where({ name: "owner" }).first();
  await db("agents").insert({
    platform_user_id: userId,
    role_id: ownerRole.id,
    is_owner: true,
    account_status: 1,
  });

  // Write to master DB index so getMe/verifyOtp can list this business
  await userRepo.insertUserBusinessIndex({
    platform_user_id: userId,
    business_id: Number(business.id),
    role: "owner",
    is_owner: true,
  });

  await repo.updateBusinessStatus(business.id, 1);

  // Mark user as a business account holder + track category
  await userRepo.updateUser(userId, { is_business_account: true });
  await userRepo.addAccountCategory(userId, { type: "business", role: input.business_type ?? "business" });

  logger.info("Business registered", { orgId: business.id, subdomain: input.subdomain, userId });

  const access_token = issueScopedAccessToken({ id: userId, email: user.email }, business.schema_name, "owner");

  return {
    org: { id: business.id, org_id: business.schema_name, subdomain: business.subdomain, business_name: business.business_name },
    access_token,
    message: "Business created.",
  };
}

/** Search other businesses by name for cross-business pickers (e.g. linking a partner). */
export async function searchBusinesses(orgId: string, search: string | undefined, limit: number) {
  const caller = await repo.findBusinessByDbName(orgId);
  if (!caller) throw new NotFoundError("Business not found");
  return repo.searchBusinesses(search, caller.id, limit);
}

/** Get full business record by schema_name (orgId from JWT). */
export async function getProfile(orgId: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Business not found");
  return business;
}

/** Update business profile fields by schema_name (orgId from JWT). */
export async function updateProfile(orgId: string, data: BusinessProfilePatchInput) {
  const existing = await repo.findBusinessByDbName(orgId);
  if (!existing) throw new NotFoundError("Business not found");
  return repo.updateBusinessProfile(existing.id, data);
}
