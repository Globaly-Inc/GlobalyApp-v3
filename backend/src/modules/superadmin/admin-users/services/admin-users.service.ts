// Admin-users service — CRUD and invitations (OTP auth handled by unified auth module).

import { randomBytes } from "node:crypto";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../../../shared/errors.js";
import { queueInvitationEmail } from "../../../auth/auth.service.js";
import { ROLE_DISPLAY } from "../../consts.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import {
  paginationToOffset,
  buildPaginatedResponse,
} from "../../../../shared/pagination.js";
import type { PaginationInput } from "../../../../shared/pagination.js";
import * as repo from "../repositories/admin-users.repository.js";
import type {
  InviteAdminInput,
  UpdateAdminInput,
} from "../schemas/admin-users.schema.js";

const logger = createChildLogger("admin-users-service");

// ── CRUD ──

export async function listAdmins(pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listAdmins(limit, offset),
    repo.countAdmins(),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function getAdmin(id: number) {
  const admin = await repo.findAdminById(id);
  if (!admin) throw new NotFoundError("Admin not found");
  return admin;
}

export async function updateAdmin(id: number, data: UpdateAdminInput) {
  const admin = await repo.findAdminById(id);
  if (!admin) throw new NotFoundError("Admin not found");
  return repo.updateAdmin(id, data);
}

// ── Invitations ──

export function roleDisplayName(role: string): string {
  return ROLE_DISPLAY[role] ?? role;
}

export async function inviteAdmin(
  input: InviteAdminInput,
  invitedBy: number,
  inviterRole: string,
) {
  if (inviterRole !== "super_admin") {
    throw new ForbiddenError("Only super_admin can invite admins");
  }

  const existing = await repo.findAdminByEmail(input.email);
  if (existing) throw new ConflictError("Email has already been taken");

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  const invitation = await repo.insertInvitation({
    email: input.email,
    name: input.name,
    role: input.role,
    invite_token: token,
    invited_by: invitedBy,
    status: "pending",
    expired_at: expiredAt,
  });

  const acceptUrl = `${config.APP_URL}/api/v3/admin/users/invite/accept?token=${token}`;
  await queueInvitationEmail({
    to: input.email,
    name: input.name,
    role: roleDisplayName(input.role),
    acceptUrl,
  });

  logger.info("Admin invitation queued", { email: input.email, invitedBy });
  return invitation;
}

export async function acceptInvitation(token: string) {
  const invitation = await repo.findInvitationByToken(token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (new Date() > invitation.expired_at) {
    throw new UnauthorizedError("Invitation has expired");
  }

  // Queue the user creation — fallback to direct insert when queue unavailable
  try {
    await queueService.publish("admin_invitation_accept", {
      invitation_id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      invited_by: invitation.invited_by,
    });
    logger.info("Invitation accept queued", { email: invitation.email });
  } catch {
    // ponytail: direct create when queue is unavailable (local dev)
    logger.warn("Queue unavailable, creating admin directly", { email: invitation.email });
    await repo.insertAdmin({
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      account_status: 1,
      added_by: invitation.invited_by,
    });
    await repo.markInvitationAccepted(invitation.id);
  }

  return { message: "Invitation accepted. Your account is being set up." };
}
