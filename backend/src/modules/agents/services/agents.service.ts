// Agent service — CRUD and invitations.
// Agents are lightweight records in per-business DB pointing to platform_users.
// Auth stays 100% in platform_users.

import { randomBytes } from "node:crypto";
import type { Knex } from "knex";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import {
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from "../../../shared/errors.js";
import { queueInvitationEmail } from "../../auth/auth.service.js";
import {
  paginationToOffset,
  buildPaginatedResponse,
} from "../../../shared/pagination.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as repo from "../repositories/agents.repository.js";
import * as platformUserRepo from "../../platform-users/repositories/platform-users.repository.js";
import * as businessRepo from "../../businesses/repositories/businesses.repository.js";
import type { AgentPatchInput, InviteAgentInput, RoleCreateInput, RolePatchInput } from "../schemas/agents.schema.js";

const logger = createChildLogger("agents-service");

/** Batch-enrich agent rows with platform_user details. One query instead of N. */
async function enrichAgents(agents: any[]) {
  if (agents.length === 0) return [];
  const ids = agents.map((a) => a.platform_user_id);
  const users = await masterKnex("platform_users")
    .whereIn("id", ids)
    .select("id", "first_name", "last_name", "email", "phone", "photo_url");
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  return agents.map((agent) => {
    const user = userMap.get(agent.platform_user_id);
    return {
      ...agent,
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,
      phone: user?.phone,
      photo_url: user?.photo_url,
    };
  });
}

// ── CRUD ──

export async function listAgents(db: Knex, pagination: PaginationInput, search?: string) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listAgents(db, limit, offset, search),
    repo.countAgents(db, search),
  ]);
  const enriched = await enrichAgents(rows);
  return buildPaginatedResponse(enriched, total, pagination);
}

export async function getAgent(db: Knex, id: number) {
  const agent = await repo.findAgentById(db, id);
  if (!agent) throw new NotFoundError("Agent not found");
  const [enriched] = await enrichAgents([agent]);
  return enriched;
}

/**
 * Which other branches (registered as their own businesses, linked via business_branches)
 * this agent's platform_user also belongs to — only meaningful called from the head office,
 * since a branch's own business_branches table is empty.
 */
export async function getAgentOffices(db: Knex, agentId: number) {
  const agent = await repo.findAgentById(db, agentId);
  if (!agent) throw new NotFoundError("Agent not found");

  const branches: { linked_business_id: number; name: string }[] = await db("business_branches")
    .whereNotNull("linked_business_id")
    .whereNull("deleted_at")
    .select("linked_business_id", "name");

  const offices: { business_id: string; name: string }[] = [];
  for (const branch of branches) {
    const linkedBusiness = await businessRepo.findBusinessById(String(branch.linked_business_id));
    if (!linkedBusiness) continue;
    const branchDb = await getKnex(linkedBusiness.id, schemaName(linkedBusiness.schema_name));
    const match = await branchDb("agents")
      .where({ platform_user_id: agent.platform_user_id })
      .whereNull("deleted_at")
      .first();
    if (match) offices.push({ business_id: linkedBusiness.id, name: branch.name });
  }
  return { offices };
}

// ── Pending invitations ("invited but not yet accepted" members) ──

function toInvitedMember(row: repo.InvitationRow) {
  const details = (row.user_details ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    first_name: (details.first_name as string) ?? null,
    last_name: (details.last_name as string) ?? null,
    email: row.email,
    phone: (details.phone as string) ?? null,
    role: (details.role as string) ?? null,
    admin_point_of_contact: Boolean(details.admin_point_of_contact),
    position: (details.position as string) ?? null,
    invited_at: row.created_at,
    expires_at: row.expired_at,
  };
}

export async function listInvitations(db: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listPendingInvitations(db, limit, offset),
    repo.countPendingInvitations(db),
  ]);
  return buildPaginatedResponse(rows.map(toInvitedMember), total, pagination);
}

export async function cancelInvitation(db: Knex, id: string) {
  const invitation = await repo.findPendingInvitationById(db, id);
  if (!invitation) throw new NotFoundError("Invitation not found");
  await repo.cancelInvitation(db, id);
}

/** Rotates the invite token/expiry and re-sends the invite email — works even on an
 * already-expired invitation, since that's exactly when a resend is needed. */
export async function resendInvitation(db: Knex, id: string, orgId: string) {
  const invitation = await repo.findInvitationById(db, id);
  if (!invitation) throw new NotFoundError("Invitation not found");

  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");

  const details = (invitation.user_details ?? {}) as Record<string, unknown>;
  const roleName = (details.role as string) ?? "member";
  const role = await repo.findRoleByName(db, roleName);

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await repo.refreshInvitationToken(db, id, token, expiredAt);

  const acceptUrl = `${config.WEB_APP_URL}/invite/agent/accept?token=${token}&org_id=${business.schema_name}`;
  queueInvitationEmail({
    to: invitation.email,
    name: (details.first_name as string) ?? "",
    role: role?.display_name ?? roleName,
    acceptUrl,
  }).catch((err) => logger.warn("Resend invitation email failed", { email: invitation.email, err: err.message }));

  logger.info("Agent invitation resent", { invitationId: id, orgId });
}

// ── Invitations ──

async function createInvitation(
  db: Knex,
  input: InviteAgentInput,
  orgId: string,
  invitedByAgentId: number,
  addedbyAdminId: number | null = null,
) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");

  // Check if email is already an agent in this business
  const existingUser = await platformUserRepo.findByEmail(input.email);
  if (existingUser) {
    const existingAgent = await repo.findAgentByPlatformUserId(db, existingUser.id);
    if (existingAgent) throw new ConflictError("User is already an agent in this business");
  }

  // Check for pending invitation with same email
  const pendingInvite = await repo.findPendingInvitationByEmail(db, input.email);
  if (pendingInvite) throw new ConflictError("Invitation already pending for this email");

  const role = await repo.findRoleByName(db, input.role);
  if (!role) throw new NotFoundError(`Role "${input.role}" not found`);

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const invitation = await repo.insertInvitation(db, {
    email: input.email,
    user_details: {
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone ?? null,
      role: input.role,
      admin_point_of_contact: input.admin_point_of_contact ?? false,
      position: input.position ?? null,
      addedby_admin_id: addedbyAdminId,
    },
    invite_token: token,
    invited_by: invitedByAgentId,
    status: "pending",
    expired_at: expiredAt,
  });

  // Points to frontend confirmation page — the page renders a button that POSTs to the API
  const acceptUrl = `${config.WEB_APP_URL}/invite/agent/accept?token=${token}&org_id=${business.schema_name}`;

  // ponytail: fire-and-forget — invitation must not fail because email is down
  queueInvitationEmail({
    to: input.email,
    name: input.first_name,
    role: role.display_name,
    acceptUrl,
  }).catch((err) => logger.warn("Invitation email failed (invitation created)", { email: input.email, err: err.message }));

  logger.info("Agent invitation sent", { email: input.email, invitedByAgentId, addedbyAdminId, orgId });
  return invitation;
}

export async function inviteAgent(
  db: Knex,
  input: InviteAgentInput,
  inviterPlatformUserId: number,
  orgId: string,
) {
  const inviterAgent = await repo.findAgentByPlatformUserId(db, inviterPlatformUserId);
  if (!inviterAgent) throw new NotFoundError("Inviter agent record not found");
  return createInvitation(db, input, orgId, inviterAgent.id);
}

export async function inviteAgentAsAdmin(db: Knex, input: InviteAgentInput, orgId: string, adminId: number) {
  const ownerAgent = await repo.findOwnerAgent(db);
  if (!ownerAgent) throw new NotFoundError("Business owner agent not found");
  return createInvitation(db, input, orgId, ownerAgent.id, adminId);
}

export async function acceptInvitation(orgId: string, token: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");
  const db = await getKnex(business.id, schemaName(business.schema_name));

  const invitation = await repo.findInvitationByToken(db, token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (new Date() > invitation.expired_at) {
    throw new UnauthorizedError("Invitation has expired");
  }

  const details = (invitation.user_details ?? {}) as Record<string, string>;
  const roleName = details.role ?? "member";
  const role = await repo.findRoleByName(db, roleName);
  if (!role) throw new NotFoundError(`Role "${roleName}" not found`);

  // Create or find platform_user for this email
  let platformUser = await platformUserRepo.findByEmail(invitation.email);
  if (!platformUser) {
    details.first_name ??= "";
    details.last_name ??= "";
    platformUser = await platformUserRepo.insert({
      first_name: details.first_name,
      last_name: details.last_name,
      email: invitation.email,
      account_status: 0, // inactive until they verify OTP
    });
  }

  // Create agent in per-business DB
  const agent = await repo.insertAgent(db, {
    platform_user_id: platformUser.id,
    role_id: role.id,
    is_owner: false,
    account_status: 1,
    added_by: invitation.invited_by,
    addedby_admin_id: (details.addedby_admin_id as unknown as number | null) ?? null,
    admin_point_of_contact: Boolean(details.admin_point_of_contact),
    first_name: platformUser.first_name,
    last_name: platformUser.last_name,
    email: platformUser.email,
    phone: platformUser.phone,
    position: (details.position as string) ?? null,
  });

  // Write to master DB index so getMe/verifyOtp can list this business
  await platformUserRepo.insertUserBusinessIndex({
    platform_user_id: platformUser.id,
    business_id: Number(business.id),
    role: roleName,
    is_owner: false,
  });

  await repo.markInvitationAccepted(db, invitation.id);

  // Mark user as business account holder + track category
  await platformUserRepo.updateUser(platformUser.id, { is_business_account: true });
  await platformUserRepo.addAccountCategory(platformUser.id, { type: "business", role: roleName });

  logger.info("Agent invitation accepted", { agentId: agent.id, platformUserId: platformUser.id, orgId });
  return {
    message: "Invitation accepted. Log in with your email to access this business.",
    org_id: business.schema_name,
    agent: { id: agent.id, role: agent.role },
  };
}

// ── Update / remove ──

/** A business can never end up with zero owners or zero super admin points of contact. */
async function assertSingleOwnerAndPocInvariants(db: Knex, agent: repo.AgentRow, patch: AgentPatchInput) {
  if (patch.is_owner === true && !agent.is_owner) {
    const existingOwner = await repo.findOwnerAgent(db);
    if (existingOwner && existingOwner.id !== agent.id) {
      throw new ConflictError("This business already has an owner");
    }
  }

  if (patch.admin_point_of_contact === false && agent.admin_point_of_contact) {
    const remaining = await repo.countPointOfContactAgents(db, agent.id);
    if (remaining === 0) throw new ConflictError("Business must have at least one point of contact for super admin");
  }
}

/**
 * `businessId` exists to keep user_business_index in step with the tenant `agents` row.
 *
 * The two must move together. `agents` is authoritative for permissions, but the index is
 * what login reads to build `businesses[]` and to sign `orgRole` — so leaving it stale means
 * /auth/me reports the member's old role and the JWT carries it. (Authorisation itself is
 * unaffected: requirePermission resolves role_id from `agents`, never from the claim.)
 */
export async function updateAgent(db: Knex, businessId: number, id: number, patch: AgentPatchInput) {
  const agent = await repo.findAgentById(db, id);
  if (!agent) throw new NotFoundError("Agent not found");

  let role_id: number | undefined;
  if (patch.role) {
    const role = await repo.findRoleByName(db, patch.role);
    if (!role) throw new NotFoundError(`Role "${patch.role}" not found`);
    role_id = role.id;
  }

  await assertSingleOwnerAndPocInvariants(db, agent, patch);

  const updated = await repo.updateAgent(db, id, {
    ...(role_id !== undefined ? { role_id } : {}),
    ...(patch.admin_point_of_contact !== undefined ? { admin_point_of_contact: patch.admin_point_of_contact } : {}),
    ...(patch.account_status !== undefined ? { account_status: patch.account_status } : {}),
    ...(patch.is_owner !== undefined ? { is_owner: patch.is_owner } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.is_public !== undefined ? { is_public: patch.is_public } : {}),
  });
  const [enriched] = await enrichAgents([updated]);

  if (patch.role !== undefined || patch.is_owner !== undefined) {
    await platformUserRepo.insertUserBusinessIndex({
      platform_user_id: agent.platform_user_id,
      business_id: businessId,
      // enrichAgents resolves role_id back to a name — used when the patch didn't set a role.
      role: patch.role ?? enriched.role,
      is_owner: patch.is_owner ?? agent.is_owner,
    });
  }

  return enriched;
}

export async function removeAgent(db: Knex, businessId: number, id: number) {
  const agent = await repo.findAgentById(db, id);
  if (!agent) throw new NotFoundError("Agent not found");
  if (agent.is_owner) throw new ConflictError("Cannot remove the business owner");
  if (agent.admin_point_of_contact) {
    const remaining = await repo.countPointOfContactAgents(db, id);
    if (remaining === 0) throw new ConflictError("Cannot remove the sole point of contact for super admin");
  }
  await repo.softDeleteAgent(db, id);
  // Without this the removed member is still handed a token scoped to this business at login,
  // and then requirePermission rejects every request — which reads as a broken account.
  await platformUserRepo.softDeleteUserBusinessIndex(agent.platform_user_id, businessId);
}

// ── Custom roles (Settings → Roles, owner-only) ──
// Both tenant kinds have identical roles/permissions/role_permissions tables; only the
// "who has this role" side differs: business agents key on role_id, institution members
// key on the role NAME (members.role text) — hence the `kind` branches on counts.

function slugifyRoleName(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function countRoleMembers(db: Knex, kind: repo.TenantKind, role: repo.RoleRow): Promise<number> {
  return kind === "institution"
    ? repo.countMembersWithRoleName(db, role.name)
    : repo.countAgentsWithRole(db, role.id);
}

async function roleWithDetails(db: Knex, kind: repo.TenantKind, role: repo.RoleRow) {
  const [links, membersCount] = await Promise.all([
    db("role_permissions").where({ role_id: role.id }).pluck("permission_id"),
    countRoleMembers(db, kind, role),
  ]);
  return { ...role, permission_ids: links as number[], members_count: membersCount };
}

export async function listRolesWithDetails(db: Knex, kind: repo.TenantKind) {
  const [roles, links, counts] = await Promise.all([
    repo.listRoles(db),
    repo.listRolePermissionLinks(db),
    kind === "institution" ? repo.countMembersPerRoleName(db) : repo.countAgentsPerRole(db),
  ]);
  const permsByRole = new Map<number, number[]>();
  for (const link of links) {
    const list = permsByRole.get(link.role_id) ?? [];
    list.push(link.permission_id);
    permsByRole.set(link.role_id, list);
  }
  // Keyed by role_id for businesses, role name for institutions.
  const countByRole = new Map(counts.map((c) => ["role_id" in c ? c.role_id : c.role, Number(c.count)]));
  return roles.map((role) => ({
    ...role,
    permission_ids: permsByRole.get(role.id) ?? [],
    members_count: countByRole.get(kind === "institution" ? role.name : role.id) ?? 0,
  }));
}

export async function listPermissions(db: Knex) {
  return repo.listPermissions(db);
}

async function assertPermissionIdsExist(db: Knex, ids: number[]) {
  if (ids.length === 0) return;
  const found = await db("permissions").whereIn("id", ids).whereNull("deleted_at").pluck("id");
  const missing = ids.filter((id) => !found.includes(id));
  if (missing.length > 0) throw new BadRequestError(`Unknown permission ids: ${missing.join(", ")}`);
}

export async function createRole(db: Knex, kind: repo.TenantKind, input: RoleCreateInput) {
  const name = slugifyRoleName(input.display_name);
  if (!name) throw new BadRequestError("Role name must contain letters or numbers");

  const existing = await repo.findRoleByName(db, name);
  if (existing) throw new ConflictError(`A role named "${existing.display_name}" already exists`);

  await assertPermissionIdsExist(db, input.permission_ids);

  const sortOrder = (await repo.maxRoleSortOrder(db)) + 1;
  const role = await repo.insertRole(db, {
    name,
    display_name: input.display_name.trim(),
    description: input.description ?? null,
    is_system: false,
    sort_order: sortOrder,
  });
  await repo.setRolePermissions(db, role.id, input.permission_ids);
  return roleWithDetails(db, kind, role);
}

export async function updateRole(db: Knex, kind: repo.TenantKind, id: number, patch: RolePatchInput) {
  const role = await repo.findRoleById(db, id);
  if (!role) throw new NotFoundError("Role not found");
  if (role.is_system) throw new ConflictError("System roles cannot be modified");

  if (patch.permission_ids !== undefined) {
    await assertPermissionIdsExist(db, patch.permission_ids);
    await repo.setRolePermissions(db, id, patch.permission_ids);
  }

  // `name` stays immutable — it's referenced by pending invitations' user_details JSONB.
  let updated = role;
  if (patch.display_name !== undefined || patch.description !== undefined) {
    updated = (await repo.updateRoleRow(db, id, {
      ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    }))!;
  }
  return roleWithDetails(db, kind, updated);
}

export async function deleteRole(db: Knex, kind: repo.TenantKind, id: number) {
  const role = await repo.findRoleById(db, id);
  if (!role) throw new NotFoundError("Role not found");
  if (role.is_system) throw new ConflictError("System roles cannot be deleted");

  const [membersCount, pendingCount] = await Promise.all([
    countRoleMembers(db, kind, role),
    repo.countPendingInvitationsWithRole(db, kind, role.name),
  ]);
  if (membersCount > 0) throw new ConflictError(`Role is assigned to ${membersCount} member(s) — reassign them first`);
  if (pendingCount > 0) throw new ConflictError(`Role is used by ${pendingCount} pending invitation(s) — cancel or wait for them first`);

  await repo.softDeleteRole(db, id);
}
