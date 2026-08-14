// Businesses service — admin-managed listing CRUD, owner provisioning, members, activity.

import { NotFoundError, ConflictError } from "../../../../../shared/errors.js";
import { provisionBusinessSchema } from "../../../../../core/business/provisioner.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { schemaName } from "../../../../../core/db/knex.js";
import * as repo from "../repositories/businesses.repository.js";
import * as userRepo from "../../../../platform-users/repositories/platform-users.repository.js";
import * as agentsRepo from "../../../../agents/repositories/agents.repository.js";
import * as agentsService from "../../../../agents/services/agents.service.js";
import type {
  BusinessCreateInput, BusinessPatchInput, BusinessStatus, EnquirySettingsPatchInput,
  MemberInviteInput, MemberPatchInput,
} from "../schemas/businesses.schema.js";

async function requireBusiness(id: number) {
  const biz = await repo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function createBusiness(input: BusinessCreateInput) {
  const existingOwner = await userRepo.findByEmail(input.email);
  if (existingOwner) throw new ConflictError("This email is already in use");

  const owner = await userRepo.insert({
    first_name: input.first_name || input.business_name,
    last_name: input.last_name ?? "",
    email: input.email,
    phone: input.phone ?? undefined,
    account_status: 1,
  });

  let business;
  try {
    business = await repo.insertBusiness({ ...input, owner_id: owner.id });
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
  } catch (err) {
    await repo.deleteBusiness(business.id);
    throw err;
  }

  return repo.findBusinessDetail(business.id);
}

export async function listBusinesses(
  limit: number, offset: number, search?: string, status?: string, category?: number, categorySlug?: string,
) {
  const [rows, total] = await Promise.all([
    repo.listBusinesses(limit, offset, search, status, category, categorySlug),
    repo.countBusinesses(search, status, category, categorySlug),
  ]);
  return { rows, total };
}

export async function getBusinessDetail(id: number) {
  const biz = await repo.findBusinessDetail(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function updateBusiness(id: number, data: BusinessPatchInput) {
  await requireBusiness(id);
  return repo.updateBusiness(id, data);
}

export async function updateStatus(id: number, status: BusinessStatus) {
  await requireBusiness(id);
  const updates: Record<string, unknown> = { status };
  if (status === "verified") updates.verified_at = new Date();
  await repo.updateBusiness(id, updates);
  return { status };
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
