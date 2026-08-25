// Business service — registration (provisions schema + creates owner agent), profile management.

import { randomBytes } from "node:crypto";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { generateText } from "../../../shared/ai/gemini.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { provisionBusinessSchema, provisionOnClaim } from "../../../core/business/provisioner.js";
import type { BusinessRecord } from "../../../core/types.js";
import { config } from "../../../config.js";
import { claimBusinessEmail } from "../../../shared/mail/templates.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as repo from "../repositories/businesses.repository.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";
import { issueScopedAccessToken, queueEmail } from "../../auth/auth.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import { issueCode } from "../../referrals/services/codes.service.js";
import type { BusinessRegisterInput, BusinessProfilePatchInput, AiAssistInput } from "../schemas/businesses.schema.js";

const logger = createChildLogger("businesses-service");
const CLAIM_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours, matching admin claim-request convention

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
      business_category_id: input.business_category_id,
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

  // A business entity gets its OWN referral code, separate from the owner's personal code — the two
  // credit different wallets. Idempotent and never throws; a failure is repaired by
  // `npm run job:referral-codes` rather than rolling back a provisioned business (INV-10).
  //
  // Business CREATION is deliberately not a qualification trigger: only verification pays out.
  issueCode("business", Number(business.id)).catch((err) =>
    logger.warn("Referral code issuance error", { businessId: business.id, err: err.message }),
  );

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

/**
 * Resolve stored logo/cover paths to signed, viewable URLs — mirrors the admin-side helper.
 * `gallery_images` itself is left untouched (raw storage paths) since the gallery editor reads,
 * modifies, and PATCHes that array back — resolving it in place would mean a save-without-editing
 * silently persists temporary signed URLs instead of the paths. A parallel `gallery_image_urls`
 * carries the resolved, display-only URLs instead; it's never sent back on PATCH.
 */
export async function withImagePreviews<
  T extends { logo_url?: string | null; cover_url?: string | null; gallery_images?: string[] | null },
>(biz: T): Promise<T & { gallery_image_urls?: (string | null)[] }> {
  const [logo_url, cover_url, gallery_image_urls] = await Promise.all([
    storage.resolvePreviewUrl(biz.logo_url),
    storage.resolvePreviewUrl(biz.cover_url),
    biz.gallery_images ? Promise.all(biz.gallery_images.map((p) => storage.resolvePreviewUrl(p))) : undefined,
  ]);
  return { ...biz, logo_url, cover_url, ...(gallery_image_urls ? { gallery_image_urls } : {}) };
}

/** Get full business record by schema_name (orgId from JWT). */
export async function getProfile(orgId: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Business not found");
  return withImagePreviews(business);
}

/** Update business profile fields by schema_name (orgId from JWT). */
export async function updateProfile(orgId: string, data: BusinessProfilePatchInput) {
  const existing = await repo.findBusinessByDbName(orgId);
  if (!existing) throw new NotFoundError("Business not found");
  const updated = await repo.updateBusinessProfile(existing.id, data);
  return withImagePreviews(updated);
}

/**
 * Self-serve claim trigger, called from the registration page after a user is told a business
 * profile already exists for their email. Always resolves silently (no "found"/"not found"
 * signal) to avoid leaking account existence — same anti-enumeration stance as `registerUser`.
 */
export async function requestClaimByEmail(email: string): Promise<void> {
  // Matched on the business's own contact email, not on a platform_user: the claimant usually
  // has no account yet — creating one is what accepting the claim does.
  const business = await repo.findUnclaimedBusinessByContactEmail(email);
  if (!business) return;

  const token = randomBytes(32).toString("hex");
  await repo.setClaimPending(business.id, token, new Date(Date.now() + CLAIM_TOKEN_TTL_MS));

  const claimUrl = `${config.WEB_APP_URL}/invite/business/accept?token=${token}`;
  // Personalise only if someone already registered on this address; otherwise stay generic,
  // since the listing itself has no name for a person.
  const existingUser = await userRepo.findByEmail(email);
  const ownerName =
    `${existingUser?.first_name ?? ""} ${existingUser?.last_name ?? ""}`.trim() || "there";
  queueEmail({ to: email, ...claimBusinessEmail({ ownerName, businessName: business.business_name, claimUrl }) }).catch((err) =>
    logger.warn("Self-serve claim request email failed", { businessId: business.id, err: err.message }),
  );
}

/** Drafts profile copy for the caller to review/edit, not to publish verbatim. */
export async function generateProfileText(input: AiAssistInput) {
  const system =
    "You write concise, factual business descriptions for education agents, institutions, and " +
    "migration/service providers listed on a study-abroad platform. No emojis, no marketing fluff, " +
    "no unverifiable superlatives — 2 to 3 sentences a real prospective student or partner would trust.";
  const prompt = [
    `Write a business description for "${input.business_name ?? "this business"}"`,
    input.business_type ? ` (a ${input.business_type})` : "",
    input.hint ? `. Additional context: ${input.hint}` : ".",
  ].join("");

  const text = await generateText({ system, prompt, maxTokens: 300 });
  return { text };
}

export async function acceptClaim(token: string, claimant: { first_name: string; last_name: string }) {
  const business = await repo.findByClaimToken(token);
  if (!business) throw new NotFoundError("This claim link is invalid or has already been used");
  if (!business.claim_token_expires_at || new Date(business.claim_token_expires_at) < new Date()) {
    throw new ConflictError("This claim link has expired");
  }

  const owner = await resolveClaimant(business, claimant);
  await repo.clearClaim(business.id);

  // A listing promoted from an extraction job has no tenant schema yet — promote
  // deliberately defers it to here. Admin-seeded businesses were provisioned at creation
  // and already have their owner agent, so they skip this entirely.
  if (!business.schema_provisioned_at) await activateClaimedListing(business, owner);

  return { email: owner?.email ?? null, business_name: business.business_name };
}

/**
 * Who ends up owning the listing, and the point at which a promoted one first gets an owner.
 *
 * Promoted listings have `owner_id` NULL — extraction captures a company email but never a
 * contact person, so there was no name to build a platform_user from. The claimant supplies
 * theirs here; it becomes their platform_user and is stamped onto the listing row so
 * `businesses.owner_id` and the admin list's owner column agree.
 *
 * A pre-existing user on the claim address is reused rather than duplicated — the claim link
 * was sent to that address, so whoever opened it holds it. Their stored name is left alone: it
 * is their own account, not this listing's to rename.
 *
 * account_status stays 0 for a newly created claimant; OTP verification promotes it to 1, the
 * same path an invited user takes.
 */
async function resolveClaimant(
  business: BusinessRecord,
  claimant: { first_name: string; last_name: string },
) {
  if (business.owner_id) return userRepo.findByIdFull(business.owner_id);

  // The claim token was mailed to businesses.email, so that address identifies the claimant.
  const email = business.email;
  if (!email) throw new ConflictError("This listing has no contact email to claim against");

  const existing = await userRepo.findByEmail(email);
  const owner =
    existing ??
    (await userRepo.insert({
      first_name: claimant.first_name,
      last_name: claimant.last_name,
      email,
      phone: business.phone ?? undefined,
      account_status: 0,
      meta: { created_via: "business_claim" },
    }));

  await repo.updateBusinessProfile(business.id, { owner_id: owner.id });
  return owner;
}

/**
 * First real ownership of a promoted listing: create the schema and give the owner the same
 * agent/index rows registerBusiness would have.
 *
 * The extracted branches/services are NOT copied in — they are read through
 * businesses.source_job_id, so there is one copy of that data and it cannot drift.
 *
 * The owner's platform_users row is still account_status 0 at this point. That is left
 * alone on purpose — OTP verification promotes it to 1 (auth.service.ts), exactly as it
 * does for an invited user.
 */
async function activateClaimedListing(business: BusinessRecord, owner: Awaited<ReturnType<typeof userRepo.findByIdFull>>) {
  // Taken from `owner`, NOT from business.owner_id: for a promoted listing that column was NULL
  // on the row we fetched and resolveClaimant has only just set it, so this copy is stale.
  if (!owner) throw new NotFoundError("Owner for this business could not be resolved");
  const ownerId = owner.id;

  await provisionOnClaim({
    kind: "business",
    id: Number(business.id),
    schema_name: business.schema_name,
  });

  const db = await getKnex(business.id, schemaName(business.schema_name));
  const ownerRole = await db("roles").where({ name: "owner" }).first();
  if (!ownerRole) throw new NotFoundError('Role "owner" not found');
  await db("agents")
    .insert({
      platform_user_id: ownerId,
      role_id: ownerRole.id,
      is_owner: true,
      account_status: 1,
      admin_point_of_contact: true,
      first_name: owner.first_name,
      last_name: owner.last_name,
      email: owner.email,
      phone: owner.phone,
    })
    // agents.platform_user_id is unique — makes a retried claim a no-op rather than a 500.
    .onConflict("platform_user_id")
    .ignore();

  await userRepo.insertUserBusinessIndex({
    platform_user_id: ownerId,
    business_id: Number(business.id),
    role: "owner",
    is_owner: true,
  });
  await userRepo.updateUser(ownerId, { is_business_account: true });
  await userRepo.addAccountCategory(ownerId, {
    type: "business",
    role: business.business_type ?? "business",
  });

  // Last, as in createBusiness: account_status 1 is what makes the business resolvable by
  // findBusinessByDbName and listUserBusinesses, so it must not flip until the rest exists.
  await repo.updateBusinessStatus(business.id, 1);

  logger.info("Promoted listing claimed", { businessId: business.id, jobId: business.source_job_id });
}
