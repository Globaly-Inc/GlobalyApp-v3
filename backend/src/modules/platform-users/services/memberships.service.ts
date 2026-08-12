// Membership-facing services for the invitee: pending business invites and position confirmations.
// Authorization always resolves the caller's identity server-side — a client never supplies an email.

import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as userRepo from "../repositories/platform-users.repository.js";
import * as indexRepo from "../repositories/business-invitations.repository.js";
import * as membershipRepo from "../repositories/memberships.repository.js";
import * as agentsRepo from "../../agents/repositories/agents.repository.js";
import { acceptInvitationById, declineInvitationById } from "../../agents/services/agents.service.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";

const logger = createChildLogger("memberships-service");

/**
 * Pending invites for the caller. Every row is re-verified against its tenant source before being
 * returned: if the index drifted (tenant accepted/declined but the index write failed, leaving no flag to
 * find it by), the stale row is repaired and withheld rather than offering an action that will no-op.
 */
export async function listPendingInvites(platformUserId: number) {
  const user = await userRepo.findById(platformUserId);
  if (!user) throw new NotFoundError("User not found");

  const candidates = await indexRepo.listPendingForUser(platformUserId, user.email);
  const expired: string[] = [];
  const live: Record<string, unknown>[] = [];

  for (const row of candidates) {
    const orgId = row.org_id as string | null;
    if (!orgId) continue;
    try {
      const db = await getKnex(Number(row.business_id), schemaName(orgId));
      const tenant = await agentsRepo.findInvitationById(db, row.tenant_invitation_id as string);
      if (!tenant) continue; // tenant row vanished — nothing to offer
      if (tenant.status !== "pending") {
        // Index drifted. Converge it now and don't offer the action.
        await indexRepo.markResponded(
          row.id as string,
          tenant.status === "accepted" ? "accepted" : "declined",
          tenant.status === "accepted" ? platformUserId : undefined,
        );
        continue;
      }
      if (new Date() > tenant.expired_at) {
        expired.push(row.id as string);
        continue;
      }
      live.push(row);
    } catch (err) {
      // A tenant we cannot reach must not break the whole card — omit the row, let the reconciler sort it.
      logger.warn("Invite tenant verification failed", {
        invite: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await indexRepo.markExpired(expired);
  return live;
}

/** Authorize an index row against the caller: linked account OR their own email. Never a supplied email. */
async function authorizeInvite(inviteId: string, platformUserId: number) {
  const row = await indexRepo.findById(inviteId);
  if (!row) throw new NotFoundError("Invitation not found");

  const user = await userRepo.findById(platformUserId);
  if (!user) throw new NotFoundError("User not found");

  const matchesUser = row.platform_user_id === platformUserId;
  const matchesEmail = row.invitee_email_normalized === indexRepo.normalizeEmail(user.email);
  if (!matchesUser && !matchesEmail) throw new ForbiddenError("This invitation is not addressed to you");

  const business = await masterKnex("businesses").where({ id: row.business_id }).first();
  if (!business) throw new NotFoundError("Business not found");

  return { row, business };
}

export async function respondToInvite(
  platformUserId: number,
  inviteId: string,
  action: "accept" | "decline",
) {
  const { row, business } = await authorizeInvite(inviteId, platformUserId);

  // Terminal already → idempotent. The PRD requires a stale row to vanish silently, not error.
  if (row.status !== "pending") return { already: true as const };

  if (action === "accept") {
    await acceptInvitationById(business.schema_name, row.tenant_invitation_id);
  } else {
    await declineInvitationById(business.schema_name, row.tenant_invitation_id);
  }
  return { already: false as const };
}

export async function listPositionUpdates(platformUserId: number) {
  return membershipRepo.listPositionUpdates(platformUserId);
}

export async function confirmPosition(platformUserId: number, membershipId: number) {
  const membership = await membershipRepo.findMembership(membershipId, platformUserId);
  if (!membership) throw new ForbiddenError("Not your membership");
  if (!membership.position) throw new NotFoundError("No position to confirm");

  const business = await masterKnex("businesses").where({ id: membership.business_id }).first();
  return membershipRepo.confirmPosition({
    platformUserId,
    membershipId,
    position: String(membership.position),
    businessName: business?.business_name ?? null,
  });
}
