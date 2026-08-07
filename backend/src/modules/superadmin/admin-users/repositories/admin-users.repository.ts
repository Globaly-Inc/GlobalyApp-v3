// Admin-users repository — queries against superadmin.admin_users (role-link table).
// Auth fields live in platform_users, not here.

import { masterKnex } from "../../../../core/db/master-pool.js";

export interface AdminUserRow {
  id: number;
  platform_user_id: number;
  role: string;
  is_active: boolean;
  added_by: number | null;
  created_at: Date;
  updated_at: Date;
  // joined from platform_users
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  photo_url?: string | null;
  account_status?: number;
}

export interface AdminInvitationRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  invite_token: string;
  invited_by: number;
  status: string;
  created_at: Date;
  expired_at: Date;
}

const ADMIN_WITH_USER_COLUMNS = [
  "superadmin.admin_users.id",
  "superadmin.admin_users.platform_user_id",
  "superadmin.admin_users.role",
  "superadmin.admin_users.is_active",
  "superadmin.admin_users.added_by",
  "superadmin.admin_users.created_at",
  "superadmin.admin_users.updated_at",
  "platform_users.first_name",
  "platform_users.last_name",
  "platform_users.email",
  "platform_users.phone",
  "platform_users.photo_url",
  "platform_users.account_status",
] as const;

function withUser(query: any) {
  return query.join("platform_users", "superadmin.admin_users.platform_user_id", "platform_users.id");
}

// ── Lookups ──

export async function findAdminByPlatformUserId(platformUserId: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .where({ platform_user_id: platformUserId, is_active: true })
    .first();
}

export async function findAdminById(id: number) {
  return withUser(masterKnex<AdminUserRow>("superadmin.admin_users"))
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .where("superadmin.admin_users.id", id)
    .first();
}

export async function findAdminByEmail(email: string) {
  return withUser(masterKnex<AdminUserRow>("superadmin.admin_users"))
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .where("platform_users.email", email)
    .first();
}

export async function listAdmins(limit: number, offset: number) {
  return withUser(masterKnex<AdminUserRow>("superadmin.admin_users"))
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .orderBy("superadmin.admin_users.id", "asc")
    .limit(limit)
    .offset(offset);
}

export async function countAdmins(): Promise<number> {
  const [{ count }] = await masterKnex("superadmin.admin_users").count("id as count");
  return Number(count);
}

export async function insertAdmin(data: {
  platform_user_id: number;
  role: string;
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
    .returning("*");
  return row;
}

// ── Invitations ──

export async function insertInvitation(data: {
  email: string;
  first_name: string;
  last_name: string;
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
