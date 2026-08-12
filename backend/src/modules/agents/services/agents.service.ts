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
import * as invitationIndexRepo from "../../platform-users/repositories/business-invitations.repository.js";
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

  // Dual write, tenant-first: the tenant row is committed, so the index write must never fail the request.
  // If it does, the invitation is still valid and the emailed token link still works — it just isn't
  // discoverable in the portal until the reconciler's tenant→index pass creates the row. Nothing can carry
  // a sync_error here because no index row exists yet, so this only logs.
  await syncIndexAfterInvite({
    businessId: Number(business.id),
    invitationId: invitation.id,
    email: input.email,
    role: input.role,
    token,
    expiresAt: expiredAt,
    invitedByPlatformUserId: inviterPlatformUserId,
    createdAt: invitation.created_at,
  });

  logger.info("Agent invitation sent", { email: input.email, invitedBy: inviterPlatformUserId, orgId });
  return invitation;
}

/** Bounded retry around a post-commit index write. Never throws — the user-facing request already won. */
async function withRetry(label: string, fn: () => Promise<void>, context: Record<string, unknown>) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === 3) {
        logger.warn(`${label} failed after retries — reconciler will recover`, { ...context, err: message });
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  return false;
}

async function syncIndexAfterInvite(input: {
  businessId: number;
  invitationId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  invitedByPlatformUserId: number;
  createdAt?: Date;
}) {
  const existingUser = await platformUserRepo.findByEmail(input.email).catch(() => undefined);
  await withRetry(
    "Invitation index insert",
    () =>
      invitationIndexRepo
        .upsert({
          business_id: input.businessId,
          tenant_invitation_id: input.invitationId,
          invitee_email: input.email,
          platform_user_id: existingUser?.id ?? null,
          role: input.role,
          token_hash: invitationIndexRepo.hashToken(input.token),
          status: "pending",
          expires_at: input.expiresAt,
          invited_by_platform_user_id: input.invitedByPlatformUserId,
          created_at: input.createdAt,
        })
        .then(() => undefined),
    { tenant_invitation_id: input.invitationId, business_id: input.businessId, email: input.email },
  );
}

/**
 * Token-based acceptance — the public path used by emailed invite links. Resolves the token to an id and
 * delegates, so there is exactly one acceptance implementation.
 */
export async function acceptInvitation(orgId: string, token: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");
  const db = await getKnex(business.id, schemaName(business.schema_name));

  const invitation = await repo.findInvitationByToken(db, token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  return acceptInvitationById(orgId, invitation.id);
}

/**
 * Id-based acceptance — used by the authenticated portal route, which authorizes off the index row and
 * cannot supply a token (the index stores only a sha256 hash, which cannot reconstruct one).
 */
export async function acceptInvitationById(orgId: string, tenantInvitationId: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");
  const db = await getKnex(business.id, schemaName(business.schema_name));

  const invitation = await repo.findInvitationById(db, tenantInvitationId);
  if (!invitation) throw new NotFoundError("Invitation not found");

  // Already terminal → idempotent no-op. A stale row must vanish quietly, not error.
  if (invitation.status !== "pending") {
    return { message: "Invitation already processed.", org_id: business.schema_name, already: true as const };
  }

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

  // Index catch-up. Tenant state is now committed and authoritative; if this fails the index keeps saying
  // "pending" with no flag to find it by (the same DB outage prevents writing sync_error), which is exactly
  // why the read path re-verifies pending rows and the reconciler reverifies state, not just existence.
  await syncIndexAfterResponse(invitation.id, "accepted", platformUser.id);

  logger.info("Agent invitation accepted", { agentId: agent.id, platformUserId: platformUser.id, orgId });
  return {
    message: "Invitation accepted. Log in with your email to access this business.",
    org_id: business.schema_name,
    agent: { id: agent.id, role: agent.role },
  };
}

async function syncIndexAfterResponse(
  tenantInvitationId: string,
  status: "accepted" | "declined",
  platformUserId?: number,
) {
  const indexRow = await invitationIndexRepo.findByTenantInvitationId(tenantInvitationId).catch(() => undefined);
  if (!indexRow) return; // never indexed — the tenant→index reconciler pass will create it in the right state
  await withRetry(
    "Invitation index status update",
    () => invitationIndexRepo.markResponded(indexRow.id, status, platformUserId),
    { tenant_invitation_id: tenantInvitationId, status },
  );
}

/**
 * Decline. The tenant row is the source of truth, so it is updated FIRST and its token cleared — an
 * index-only decline would leave the tenant invitation pending, and the emailed link would still accept it.
 */
export async function declineInvitationById(orgId: string, tenantInvitationId: string) {
  const business = await repo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Organization not found");
  const db = await getKnex(business.id, schemaName(business.schema_name));

  const invitation = await repo.findInvitationById(db, tenantInvitationId);
  if (!invitation) throw new NotFoundError("Invitation not found");

  if (invitation.status === "accepted") {
    throw new ConflictError("Invitation has already been accepted");
  }
  if (invitation.status === "declined") {
    return { message: "Invitation already declined.", already: true as const };
  }

  await repo.markInvitationDeclined(db, invitation.id);
  await syncIndexAfterResponse(invitation.id, "declined");

  logger.info("Agent invitation declined", { tenantInvitationId, orgId });
  return { message: "Invitation declined." };
}
