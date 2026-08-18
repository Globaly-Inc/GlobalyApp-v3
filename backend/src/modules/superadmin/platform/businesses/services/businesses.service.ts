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
      const trxBusiness = await repo.insertBusiness({ ...businessInput, owner_id: trxOwner.id }, trx);
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

export async function listBusinesses(
  limit: number, offset: number, search?: string, status?: string, category?: number, categorySlug?: string,
) {
  const [rawRows, total] = await Promise.all([
    repo.listBusinesses(limit, offset, search, status, category, categorySlug),
    repo.countBusinesses(search, status, category, categorySlug),
  ]);
  const rows = await Promise.all(rawRows.map(withImagePreviews));
  return { rows, total };
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
  if (!biz.owner_email) throw new ConflictError("This business has no owner email to send a claim request to");

  const token = randomBytes(32).toString("hex");
  const claim_token_expires_at = new Date(Date.now() + CLAIM_TOKEN_TTL_MS);
  await repo.updateBusiness(id, { claim_token: token, claim_token_expires_at, claim_status: "claim_pending" });

  const claimUrl = `${config.WEB_APP_URL}/invite/business/accept?token=${token}`;
  const ownerName = `${biz.owner_first_name ?? ""} ${biz.owner_last_name ?? ""}`.trim() || "there";
  queueEmail({ to: biz.owner_email, ...claimBusinessEmail({ ownerName, businessName: biz.business_name, claimUrl }) }).catch((err) =>
    logger.warn("Claim request email failed", { businessId: id, err: err.message }),
  );

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
  return agentsService.updateAgent(tenantDb, memberId, patch);
}

export async function removeMember(id: number, memberId: number) {
  const biz = await requireBusiness(id);
  const tenantDb = await getKnex(biz.id, schemaName(biz.schema_name));
  await agentsService.removeAgent(tenantDb, memberId);
}

export async function listActivity(id: number, limit: number, offset: number) {
  await requireBusiness(id);
  return repo.listBusinessActivity(id, limit, offset);
}
