// Admin-users repository — all queries against globalyapp admin_users / admin_invitations tables.

import { masterKnex } from "../../../../core/db/master-pool.js";

export interface AdminUserRow {
  id: number;
  uuid: string;
  name: string;
  email: string;
  role: string;
  otp: string | null;
  otp_expires_at: Date | null;
  refresh_token: string | null;
  photo_url: string | null;
  account_status: number;
  is_email_verified: boolean;
  added_by: number | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminInvitationRow {
  id: string;
  email: string;
  name: string;
  role: string;
  invite_token: string;
  invited_by: number;
  status: string;
  created_at: Date;
  expired_at: Date;
}

const SAFE_COLUMNS = [
  "id",
  "uuid",
  "name",
  "email",
  "role",
  "photo_url",
  "account_status",
  "is_email_verified",
  "added_by",
  "meta",
  "created_at",
  "updated_at",
] as const;

export async function findAdminByEmail(email: string) {
  return masterKnex<AdminUserRow>("superadmin.admin_users").where({ email }).first();
}

export async function findAdminById(id: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .select(SAFE_COLUMNS as unknown as string[])
    .where({ id })
    .first();
}

export async function findAdminByIdFull(id: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users").where({ id }).first();
}

export async function updateOtp(userId: number, otp: string, expiresAt: Date) {
  await masterKnex("superadmin.admin_users")
    .where({ id: userId })
    .update({ otp, otp_expires_at: expiresAt, updated_at: masterKnex.fn.now() });
}

export async function clearOtp(userId: number) {
  await masterKnex("superadmin.admin_users")
    .where({ id: userId })
    .update({ otp: null, otp_expires_at: null, updated_at: masterKnex.fn.now() });
}

export async function updateRefreshToken(userId: number, token: string | null) {
  await masterKnex("superadmin.admin_users")
    .where({ id: userId })
    .update({ refresh_token: token, updated_at: masterKnex.fn.now() });
}

export async function findAdminByRefreshToken(token: string) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .where({ refresh_token: token })
    .first();
}

export async function listAdmins(limit: number, offset: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .select(SAFE_COLUMNS as unknown as string[])
    .orderBy("id", "asc")
    .limit(limit)
    .offset(offset);
}

export async function countAdmins(): Promise<number> {
  const [{ count }] = await masterKnex("superadmin.admin_users").count("id as count");
  return Number(count);
}

export async function insertAdmin(data: {
  name: string;
  email: string;
  role: string;
  account_status: number;
  added_by?: number;
}) {
  const [row] = await masterKnex<AdminUserRow>("superadmin.admin_users")
    .insert({ ...data, created_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function updateAdmin(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex<AdminUserRow>("superadmin.admin_users")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning(SAFE_COLUMNS as unknown as string[]);
  return row;
}

export async function insertInvitation(data: {
  email: string;
  name: string;
  role: string;
  invite_token: string;
  invited_by: number;
  status: string;
  expired_at: Date;
}) {
  const [row] = await masterKnex<AdminInvitationRow>("superadmin.admin_invitations")
    .insert({ ...data, created_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function findInvitationByToken(token: string) {
  return masterKnex<AdminInvitationRow>("superadmin.admin_invitations")
    .where({ invite_token: token, status: "pending" })
    .first();
}

export async function markInvitationAccepted(id: string) {
  await masterKnex("superadmin.admin_invitations")
    .where({ id })
    .update({ status: "accepted" });
}
