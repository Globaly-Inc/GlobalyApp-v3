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
import type { InviteAgentInput } from "../schemas/agents.schema.js";

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

export async function listAgents(db: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listAgents(db, limit, offset),
    repo.countAgents(db),
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

// ── Invitations ──

export async function inviteAgent(
  db: Knex,
  input: InviteAgentInput,
  inviterPlatformUserId: number,
  orgId: string,
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

  // Find inviter's agent record for the invited_by FK
  const inviterAgent = await repo.findAgentByPlatformUserId(db, inviterPlatformUserId);
  if (!inviterAgent) throw new NotFoundError("Inviter agent record not found");

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
    },
    invite_token: token,
    invited_by: inviterAgent.id,
    status: "pending",
    expired_at: expiredAt,
  });

  // Points to frontend confirmation page — the page renders a button that POSTs to the API
  const acceptUrl = `${config.APP_URL}/invite/agent/accept?token=${token}&org_id=${business.schema_name}`;

  // ponytail: fire-and-forget — invitation must not fail because email is down
  queueInvitationEmail({
    to: input.email,
    name: input.first_name,
    role: role.display_name,
    acceptUrl,
  }).catch((err) => logger.warn("Invitation email failed (invitation created)", { email: input.email, err: err.message }));

  logger.info("Agent invitation sent", { email: input.email, invitedBy: inviterPlatformUserId, orgId });
  return invitation;
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
