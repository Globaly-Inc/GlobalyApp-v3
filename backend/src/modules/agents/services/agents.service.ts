// Agent service — CRUD, invitations (OTP auth handled by unified auth module).

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
import { buildConnString } from "../../../core/db/knex.js";
import * as repo from "../repositories/agents.repository.js";
import type { InviteAgentInput } from "../schemas/agents.schema.js";

const logger = createChildLogger("agents-service");

/** Resolve a business by subdomain and return its Knex instance. */
async function resolveBusinessDb(subdomain: string) {
  const business = await repo.findBusinessBySubdomain(subdomain);
  if (!business) throw new NotFoundError("Organization not found");
  const db = await getKnex(business.id, buildConnString(business));
  return { business, db };
}

// ── CRUD ──

export async function listAgents(db: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listAgents(db, limit, offset),
    repo.countAgents(db),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function getAgent(db: Knex, id: number) {
  const agent = await repo.findAgentById(db, id);
  if (!agent) throw new NotFoundError("Agent not found");
  return agent;
}

// ── Invitations ──

export async function inviteAgent(
  db: Knex,
  input: InviteAgentInput,
  invitedBy: number,
  businessId: string,
) {
  const business = await repo.findBusinessById(businessId);
  if (!business) throw new NotFoundError("Organization not found");
  const subdomain = business.subdomain;
  const existing = await repo.findAgentByEmail(db, input.email);
  if (existing) throw new ConflictError("Email has already been taken by another agent");

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
    invited_by: invitedBy,
    status: "pending",
    expired_at: expiredAt,
  });

  const acceptUrl = `${config.APP_URL}/api/v3/agents/invite/accept?token=${token}&subdomain=${subdomain}`;

  const role = await repo.findRoleByName(db, input.role);
  if (!role) throw new NotFoundError(`Role "${input.role}" not found`);

  await queueInvitationEmail({
    to: input.email,
    name: input.first_name,
    role: role.display_name,
    acceptUrl,
  });

  logger.info("Agent invitation sent", { email: input.email, invitedBy, subdomain });
  return invitation;
}

export async function acceptInvitation(subdomain: string, token: string) {
  const { db } = await resolveBusinessDb(subdomain);

  const invitation = await repo.findInvitationByToken(db, token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (new Date() > invitation.expired_at) {
    throw new UnauthorizedError("Invitation has expired");
  }

  const details = (invitation.user_details ?? {}) as Record<string, string>;
  const roleName = details.role ?? "member";
  const role = await repo.findRoleByName(db, roleName);
  if (!role) throw new NotFoundError(`Role "${roleName}" not found`);

  const agent = await repo.insertAgent(db, {
    first_name: details.first_name ?? "",
    last_name: details.last_name ?? "",
    email: invitation.email,
    username: invitation.email,
    role_id: role.id,
    account_status: 1,
    is_owner: false,
    added_by: invitation.invited_by,
  });

  await repo.markInvitationAccepted(db, invitation.id);

  logger.info("Agent invitation accepted", { agentId: agent.id, email: agent.email, subdomain });
  return {
    message: "Invitation accepted",
    agent: { id: agent.id, email: agent.email, role: agent.role },
  };
}
