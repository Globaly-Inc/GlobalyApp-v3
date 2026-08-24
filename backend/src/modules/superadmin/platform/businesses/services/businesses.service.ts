// Businesses service — admin-managed listing CRUD, owner provisioning, members, activity.

import { randomBytes } from "node:crypto";
import { NotFoundError, ConflictError } from "../../../../../shared/errors.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import { provisionBusinessSchema } from "../../../../../core/business/provisioner.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { schemaName } from "../../../../../core/db/knex.js";
import { config } from "../../../../../config.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import { queueService } from "../../../../../shared/queue/queueService.js";
import { queueEmail } from "../../../../auth/auth.service.js";
import { claimBusinessEmail } from "../../../../../shared/mail/templates.js";
import * as repo from "../repositories/businesses.repository.js";
import * as userRepo from "../../../../platform-users/repositories/platform-users.repository.js";
import * as agentsRepo from "../../../../agents/repositories/agents.repository.js";
import * as agentsService from "../../../../agents/services/agents.service.js";
import type {
  BusinessCreateInput, BusinessPatchInput, BusinessStatus, EnquirySettingsPatchInput,
  MemberInviteInput, MemberPatchInput,
} from "../schemas/businesses.schema.js";

const logger = createChildLogger("superadmin-businesses-service");

const CLAIM_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours, matching admin/agent invite convention

// The self-registration form (businesses/routes/businesses.routes.ts) sets `business_type`
// directly. This admin-create form only asks for a `business_category_id`, so without this an
// admin-created business gets business_type = null and silently drops out of every public
// search tab, which filters on business_type (not business_category_id — see
// search/repositories/businesses.repository.ts). Keyed on the category's `slug`, not its id —
// ids are only pinned by the seeder's intent, not guaranteed in every environment.
const BUSINESS_TYPE_BY_CATEGORY_SLUG: Record<string, string> = {
  institutions: "institution",
  education_agency: "agent",
  visa_services: "service_provider",
  accreditation_body: "accreditation_body",
  migration_agents: "agent",
  immigration_departments: "immigration_department",
};

async function businessTypeForCategory(categoryId: number): Promise<string | null> {
  const category = await masterKnex("business_categories").where({ id: categoryId }).select("slug").first();
  return category ? BUSINESS_TYPE_BY_CATEGORY_SLUG[category.slug] ?? null : null;
}

async function withImagePreviews<T extends { logo_url?: string | null; cover_url?: string | null }>(biz: T): Promise<T> {
  const [logo_url, cover_url] = await Promise.all([
    storage.resolvePreviewUrl(biz.logo_url),
    storage.resolvePreviewUrl(biz.cover_url),
  ]);
  return { ...biz, logo_url, cover_url };
}

async function requireBusiness(id: number) {
  const biz = await repo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function createBusiness(input: BusinessCreateInput) {
  const existingOwner = await userRepo.findByEmail(input.email);
  if (existingOwner) throw new ConflictError("This email is already in use");


  const { first_name, last_name, ...businessInput } = input;


  let owner: Awaited<ReturnType<typeof userRepo.insert>>;
  let business: Awaited<ReturnType<typeof repo.insertBusiness>>;
  try {
    ({ owner, business } = await masterKnex.transaction(async (trx) => {
      const trxOwner = await userRepo.insert({
        first_name: first_name || input.business_name,
        last_name: last_name ?? "",
        email: input.email,
        phone: input.phone ?? undefined,
        account_status: 1,
      }, trx);
      const trxBusiness = await repo.insertBusiness({
        ...businessInput,
        owner_id: trxOwner.id,
        business_type: await businessTypeForCategory(businessInput.business_category_id),
      }, trx);
      return { owner: trxOwner, business: trxBusiness };
    }));
  } catch (err: any) {
    if (err.code === "23505") throw new ConflictError("Subdomain already taken");
    throw err;
  }

  try {
    await provisionBusinessSchema(business.schema_name);
    const tenantDb = await getKnex(business.id, schemaName(business.schema_name));
    const ownerRole = await agentsRepo.findRoleByName(tenantDb, "owner");
    if (!ownerRole) throw new NotFoundError('Role "owner" not found');
    await agentsRepo.insertAgent(tenantDb, {
      platform_user_id: owner.id,
      role_id: ownerRole.id,
      is_owner: true,
      account_status: 1,
      admin_point_of_contact: true,
      first_name: owner.first_name,
      last_name: owner.last_name,
      email: owner.email,
      phone: owner.phone,
    });
    await userRepo.insertUserBusinessIndex({
      platform_user_id: owner.id,
      business_id: Number(business.id),
      role: "owner",
      is_owner: true,
    });
    // Mark the owner as a business account holder — same as the self-service registration flow.
    // Without this, /auth/me reports is_business_account: false for an owner who clearly has one.
    await userRepo.updateUser(owner.id, { is_business_account: true });
    
    await userRepo.addAccountCategory(owner.id, { type: "business", role: business.business_type ?? "business" });
    // Only now is the business fully provisioned — findBusinessByDbName (used by the
    // invite/accept flow) requires account_status: 1, same as the self-service registration flow.
    await repo.updateBusiness(business.id, { account_status: 1 });
  } catch (err) {
    await repo.deleteBusiness(business.id);
    throw err;
  }

  return repo.findBusinessDetail(business.id);
}

/**
 * The admin listing list, spanning BOTH tables.
 *
 * Businesses and institutions are the same kind of record, split across two tables only to stop
 * one table holding everything — so the category filter decides which table to read:
 *
 *   category = 'institutions'  -> institutions only
 *   any other category         -> businesses only (an institution has no other category)
 *   no category ("All")        -> both
 *
 * The "both" case pages over the two tables together. It over-fetches — `limit + offset` from
 * each side, merged, sorted by created_at, then sliced — because a row's position in the
 * combined order can't be known from either table alone. Correct for any page, and bounded by
 * page depth rather than table size.
 *
 * ponytail: a SQL UNION ALL would push the merge into Postgres. Worth doing when admins page
 * deep; at a few hundred listings this is cheaper to read than to optimise.
 */
export async function listBusinesses(
  limit: number, offset: number, search?: string, status?: string, category?: number, categorySlug?: string,
) {
  const scope = await resolveListScope(category, categorySlug);

  if (scope === "institutions") {
    const [rawRows, total] = await Promise.all([
      repo.listInstitutions(limit, offset, search, status),
      repo.countInstitutions(search, status),
    ]);
    return { rows: await Promise.all(rawRows.map(withImagePreviews)), total };
  }

  if (scope === "businesses") {
    const [rawRows, total] = await Promise.all([
      repo.listBusinesses(limit, offset, search, status, category, categorySlug),
      repo.countBusinesses(search, status, category, categorySlug),
    ]);
    return { rows: await Promise.all(rawRows.map(withImagePreviews)), total };
  }

  const depth = limit + offset;
  const [bizRows, instRows, bizTotal, instTotal] = await Promise.all([
    repo.listBusinesses(depth, 0, search, status),
    repo.listInstitutions(depth, 0, search, status),
    repo.countBusinesses(search, status),
    repo.countInstitutions(search, status),
  ]);

  const merged = [...bizRows, ...instRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(offset, offset + limit);

  return {
    rows: await Promise.all(merged.map(withImagePreviews)),
    total: bizTotal + instTotal,
  };
}

/**
 * Which table(s) the current category filter means.
 *
 * Resolved by SLUG, never a hardcoded id, so a reseeded categories table can't silently point
 * this at the wrong table — same reason promote resolves it that way.
 */
async function resolveListScope(
  category?: number,
  categorySlug?: string,
): Promise<"businesses" | "institutions" | "both"> {
  if (!category && !categorySlug) return "both";
  const slug = categorySlug ?? (await repo.findCategorySlugById(Number(category)));
  return slug === "institutions" ? "institutions" : "businesses";
}

export async function getBusinessDetail(id: number) {
  const biz = await repo.findBusinessDetail(id);
  if (!biz) throw new NotFoundError("Business not found");
  return withImagePreviews(biz);
}

export async function updateBusiness(id: number, data: BusinessPatchInput) {
  await requireBusiness(id);
  const updated = await repo.updateBusiness(id, data);
  return withImagePreviews(updated);
}

export async function updateStatus(id: number, status: BusinessStatus) {
  await requireBusiness(id);
  const updates: Record<string, unknown> = { status };
  if (status === "verified") updates.verified_at = new Date();
  await repo.updateBusiness(id, updates);

  return { status };
}

/** Emails the business owner a link to claim their pre-seeded account, then flips claim_status to claim_pending — `status` (verification) is untouched. */
export async function sendClaimRequest(id: number) {
  const biz = await repo.findBusinessDetail(id);
  if (!biz) throw new NotFoundError("Business not found");

  // MUST match the address acceptClaim resolves the claimant against, or the link would be
  // mailed to one person and the account created for another. An owner-bearing listing resolves
  // by owner_id, so it goes to the owner; an ownerless promoted listing resolves by the
  // business's own contact email, so it goes there.
  const to = biz.owner_id ? biz.owner_email : biz.email;
  if (!to) {
    throw new ConflictError(
      "This business has no email to send a claim request to — extraction found no contact address",
    );
  }

  const token = randomBytes(32).toString("hex");
  const claim_token_expires_at = new Date(Date.now() + CLAIM_TOKEN_TTL_MS);
  await repo.updateBusiness(id, {
    claim_token: token,
    claim_token_expires_at,
    claim_status: "claim_pending",
    // `status` too, because that is the column the admin badge and the status filter read
    // (STATUS_LABELS has a "Claim Pending" entry for it). Writing only claim_status left the
    // badge stuck on "Unverified" and made the Claim Pending filter match nothing.
    //
    // Only from "unverified", so sending a claim request can't quietly downgrade a business
    // that is already verified or suspended.
    ...(biz.status === "unverified" ? { status: "claim_pending" } : {}),
  });

  const claimUrl = `${config.WEB_APP_URL}/invite/business/accept?token=${token}`;
  const ownerName = `${biz.owner_first_name ?? ""} ${biz.owner_last_name ?? ""}`.trim() || "there";
  queueEmail({ to, ...claimBusinessEmail({ ownerName, businessName: biz.business_name, claimUrl }) }).catch((err) =>
    logger.warn("Claim request email failed", { businessId: id, err: err.message }),
  );

  return { claim_status: "claim_pending" as const };
}

/**
 * Admin-triggered claim request for an institution — the institution twin of the above.
 *
 * Mails the INSTITUTION'S contact email (the address extraction captured), which is the same
 * column acceptInstitutionClaim resolves the claimant against.
 */
export async function sendInstitutionClaimRequest(id: number) {
  const inst = await repo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");

  // Exactly the business rule, and it MUST match acceptInstitutionClaim's resolveClaimant:
  // an institution with an owner (promote sets one when the job has a named agent) resolves by
  // platform_user_id, so the link goes to that owner; an ownerless one resolves by the
  // institution's own contact email, so it goes there.
  //
  // Getting this wrong doesn't just mislabel the dialog — it mails the link to one address while
  // the account gets created for whoever owns the other.
  const owner = inst.platform_user_id ? await userRepo.findByIdFull(inst.platform_user_id) : null;
  const to = owner?.email ?? inst.email;
  if (!to) {
    throw new ConflictError(
      "This institution has no contact email to send a claim request to — extraction found no address",
    );
  }

  const token = randomBytes(32).toString("hex");
  // setInstitutionClaimPending writes claim_status; the admin badge reads `status`, so both move
  // together here for the same reason as the business path above.
  await userRepo.setInstitutionClaimPending(id, token, new Date(Date.now() + CLAIM_TOKEN_TTL_MS));
  await userRepo.updateInstitution(id, { status: "claim_pending" });

  const claimUrl = `${config.WEB_APP_URL}/invite/institution/accept?token=${token}`;
  const ownerName = `${inst.first_name ?? ""} ${inst.last_name ?? ""}`.trim() || "there";
  // ponytail: same template as the business claim — the copy is generic. An institution-specific
  // one can wait until the wording actually matters.
  queueEmail({
    to,
    ...claimBusinessEmail({ ownerName, businessName: inst.institution_name, claimUrl }),
  }).catch((err) => logger.warn("Institution claim request email failed", { institutionId: id, err: err.message }));

  return { claim_status: "claim_pending" as const };
}

/** Enqueues claim-request emails for many businesses at once — processed by the `job:business-claim-requests` worker. */
export async function queueBulkClaimRequests(ids: number[]) {
  try {
    await queueService.publish("business_claim_requests_bulk", { ids });
  } catch {
    // ponytail: fallback to inline processing when the queue is unavailable (local dev)
    logger.warn("Queue unavailable, sending bulk claim requests inline", { count: ids.length });
    await Promise.allSettled(ids.map((id) => sendClaimRequest(id)));
  }
  return { queued: ids.length };
}

export async function updatePublished(id: number, isPublished: boolean) {
  await requireBusiness(id);
  await repo.updateBusiness(id, { is_published: isPublished });
  return { is_published: isPublished };
}

export async function deleteBusiness(id: number) {
  await requireBusiness(id);
  await repo.deleteBusiness(id);
}

// ─── Institution twins ────────────────────────────────────────────────────────
// The admin list mixes both tables, so every row action needs a twin on this side too —
// same rule as sendInstitutionClaimRequest above. Separate ids, identical behavior.

async function requireInstitution(id: number) {
  const inst = await repo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

export async function updateInstitutionStatus(id: number, status: BusinessStatus) {
  await requireInstitution(id);
  await userRepo.updateInstitution(id, { status, ...(status === "verified" ? { verified_at: new Date() } : {}) });
  return { status };
}

export async function updateInstitutionPublished(id: number, isPublished: boolean) {
  await requireInstitution(id);
  await userRepo.updateInstitution(id, { is_published: isPublished });
  return { is_published: isPublished };
}

export async function deleteInstitution(id: number) {
  await requireInstitution(id);
  // Same soft delete as deleteBusiness — every institutions read filters on deleted_at.
  await userRepo.updateInstitution(id, { deleted_at: new Date() });
}

export async function updateEnquirySettings(id: number, data: EnquirySettingsPatchInput) {
  await requireBusiness(id);
  return repo.updateBusiness(id, data);
}

export async function listMembers(
  id: number,
  opts: { pointOfContact?: boolean; search?: string; limit: number; offset: number },
) {
  const biz = await requireBusiness(id);
  return repo.listBusinessMembers(id, biz.schema_name, opts);
}

export async function listMemberRoles(id: number) {
  const biz = await requireBusiness(id);
  const tenantDb = await getKnex(biz.id, schemaName(biz.schema_name));
  return agentsRepo.listRoles(tenantDb);
}

export async function inviteMember(id: number, input: MemberInviteInput, adminId: number) {
  const biz = await requireBusiness(id);
  const tenantDb = await getKnex(biz.id, schemaName(biz.schema_name));
  return agentsService.inviteAgentAsAdmin(tenantDb, input, biz.schema_name, adminId);
}

export async function updateMember(id: number, memberId: number, patch: MemberPatchInput) {
  const biz = await requireBusiness(id);
  const tenantDb = await getKnex(biz.id, schemaName(biz.schema_name));
  return agentsService.updateAgent(tenantDb, Number(biz.id), memberId, patch);
}

export async function removeMember(id: number, memberId: number) {
  const biz = await requireBusiness(id);
  const tenantDb = await getKnex(biz.id, schemaName(biz.schema_name));
  await agentsService.removeAgent(tenantDb, Number(biz.id), memberId);
}

export async function listActivity(id: number, limit: number, offset: number) {
  await requireBusiness(id);
  return repo.listBusinessActivity(id, limit, offset);
}
