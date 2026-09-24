import { randomBytes } from "node:crypto";
import { config } from "../../../../config.js";
import * as storage from "../../../../shared/storage/storageService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../../../shared/errors.js";
import { queueInvitationEmail } from "../../../auth/auth.service.js";
import { ROLE_DISPLAY } from "../../consts.js";
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

export async function listAdmins(pagination: PaginationInput, search?: string) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listAdmins(limit, offset, search),
    repo.countAdmins(search),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

/** Every signed-up platform_user — students, business/institution owners, everyone — not just admins. */
export async function listPlatformUsers(
  pagination: PaginationInput,
  search?: string,
  type?: repo.PlatformUserType,
  adminOnly?: boolean,
) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listPlatformUsers(limit, offset, search, type, adminOnly),
    repo.countPlatformUsers(search, type, adminOnly),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function updatePlatformUser(
  id: number,
  data: { account_status?: number; is_email_verified?: boolean },
  callerPlatformUserId: number,
) {
  if (data.account_status === 0 && id === callerPlatformUserId) {
    throw new ForbiddenError("You cannot suspend your own account");
  }
  const row = await repo.updatePlatformUserStatus(id, data);
  if (!row) throw new NotFoundError("Platform user not found");
  return row;
}


export async function setPlatformUserAdminRole(
  id: number,
  role: "super_admin" | "data_admin" | null,
  callerPlatformUserId: number,
) {
  if (id === callerPlatformUserId) {
    throw new ForbiddenError("You cannot change your own admin role");
  }
  const callerAdmin = await repo.findAdminByPlatformUserId(callerPlatformUserId);
  if (!callerAdmin || callerAdmin.role !== "super_admin") {
    throw new ForbiddenError("Only super_admin can grant admin roles");
  }
  if (role === null) return repo.deactivateAdminForPlatformUser(id);
  return repo.upsertAdminForPlatformUser(id, role, callerAdmin.id);
}

export async function getAdmin(id: number) {
  const admin = await repo.findAdminById(id);
  if (!admin) throw new NotFoundError("Admin not found");
  return admin;
}

export async function getAdminByPlatformUserId(platformUserId: number) {
  const admin = await repo.findAdminByPlatformUserId(platformUserId);
  if (!admin) throw new NotFoundError("Admin not found");
  const full = await repo.findAdminById(admin.id);
  if (!full) throw new NotFoundError("Admin not found");
  const [photo_url, cover_url] = await Promise.all([
    storage.resolvePreviewUrl(full.photo_url ?? null),
    storage.resolvePreviewUrl(full.cover_url ?? null),
  ]);
  return { ...full, photo_url, cover_url };
}

export async function updateAdmin(id: number, data: UpdateAdminInput, callerRole: string) {
  if (callerRole !== "super_admin") {
    throw new ForbiddenError("Only super_admin can edit admin roles or status");
  }
  const admin = await repo.findAdminById(id);
  if (!admin) throw new NotFoundError("Admin not found");
  return repo.updateAdmin(id, data);
}

// ── Invitations ──

export async function listInvitations(pagination: PaginationInput, search?: string) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listInvitations(limit, offset, search),
    repo.countInvitations(search),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

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

export async function resendInvitation(id: string, inviterRole: string) {
  if (inviterRole !== "super_admin") {
    throw new ForbiddenError("Only super_admin can resend invitations");
  }

  const invitation = await repo.findInvitationById(id);
  if (!invitation) throw new NotFoundError("Invitation not found");
  if (invitation.status !== "pending") throw new ConflictError("Only pending invitations can be resent");

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
  await repo.resendInvitationToken(id, token, expiredAt);

  const acceptUrl = `${config.CORS_ORIGINS}/auth/accept-invite?token=${token}`;
  await queueInvitationEmail({
    to: invitation.email,
    name: invitation.first_name,
    role: roleDisplayName(invitation.role),
    acceptUrl,
  });

  logger.info("Admin invitation resent", { email: invitation.email });
  return { message: "Invitation resent." };
}

export async function acceptInvitation(token: string) {
  const invitation = await repo.findInvitationByToken(token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (new Date() > invitation.expired_at) {
    throw new UnauthorizedError("Invitation has expired");
  }

  // Create or find platform_user for this email
  let platformUser = await platformUserRepo.findByEmail(invitation.email);
  platformUser ??= await platformUserRepo.insert({
    first_name: invitation.first_name,
    last_name: invitation.last_name,
    email: invitation.email,
    account_status: 1,
    is_personal_account: true,
  });

  // Create admin role-link synchronously — one cheap insert, no queue needed
  const existingAdmin = await repo.findAdminByPlatformUserId(platformUser.id);
  if (!existingAdmin) {
    await repo.insertAdmin({
      platform_user_id: platformUser.id,
      role: invitation.role,
      added_by: invitation.invited_by,
    });
  }
  await repo.markInvitationAccepted(invitation.id);

  logger.info("Admin invitation accepted", { email: invitation.email });
  return { message: "Invitation accepted." };
}
