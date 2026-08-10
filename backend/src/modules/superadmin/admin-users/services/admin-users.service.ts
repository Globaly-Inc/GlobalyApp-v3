// Admin-users service — CRUD and invitations.
// Admins are platform_users with an admin role-link.

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
import * as platformUserRepo from "../../../platform-users/repositories/platform-users.repository.js";
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

export async function getAdminByPlatformUserId(platformUserId: number) {
  const admin = await repo.findAdminByPlatformUserId(platformUserId);
  if (!admin) throw new NotFoundError("Admin not found");
  // Enrich with platform_user details
  return repo.findAdminById(admin.id);
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
  invitedByPlatformUserId: number,
  inviterRole: string,
) {
  if (inviterRole !== "super_admin") {
    throw new ForbiddenError("Only super_admin can invite admins");
  }

  const existing = await repo.findAdminByEmail(input.email);
  if (existing) throw new ConflictError("Email has already been taken");

  // Look up the admin_users.id for the inviter (JWT.sub is platform_user_id now)
  const inviterAdmin = await repo.findAdminByPlatformUserId(invitedByPlatformUserId);
  if (!inviterAdmin) throw new ForbiddenError("Inviter admin record not found");

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  const invitation = await repo.insertInvitation({
    email: input.email,
    first_name: input.first_name,
    last_name: input.last_name,
    role: input.role,
    invite_token: token,
    invited_by: inviterAdmin.id,
    status: "pending",
    expired_at: expiredAt,
  });

  const acceptUrl = `${config.CORS_ORIGINS}/auth/accept-invite?token=${token}`;
  await queueInvitationEmail({
    to: input.email,
    name: input.first_name,
    role: roleDisplayName(input.role),
    acceptUrl,
  });

  logger.info("Admin invitation queued", { email: input.email, invitedBy: invitedByPlatformUserId });
  return invitation;
}

export async function acceptInvitation(token: string) {
  const invitation = await repo.findInvitationByToken(token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (new Date() > invitation.expired_at) {
    throw new UnauthorizedError("Invitation has expired");
  }

  // Create or find platform_user for this email
  let platformUser = await platformUserRepo.findByEmail(invitation.email);
  if (!platformUser) {
    platformUser = await platformUserRepo.insert({
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      email: invitation.email,
      account_status: 1,
    });
  }

  // Create admin role-link — fallback to direct insert when queue unavailable
  try {
    await queueService.publish("admin_invitation_accept", {
      invitation_id: invitation.id,
      platform_user_id: platformUser.id,
      role: invitation.role,
      invited_by: invitation.invited_by,
    });
    logger.info("Invitation accept queued", { email: invitation.email });
  } catch {
    // ponytail: direct create when queue is unavailable (local dev)
    logger.warn("Queue unavailable, creating admin directly", { email: invitation.email });
    await repo.insertAdmin({
      platform_user_id: platformUser.id,
      role: invitation.role,
      added_by: invitation.invited_by,
    });
    await repo.markInvitationAccepted(invitation.id);
  }

  return { message: "Invitation accepted. Your account is being set up." };
}
