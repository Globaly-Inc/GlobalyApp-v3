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
  cover_url?: string | null;
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
  "platform_users.cover_url",
  "platform_users.account_status",
] as const;

function withUser(query: any) {
  return query.join("platform_users", "superadmin.admin_users.platform_user_id", "platform_users.id");
}

// ── Lookups ──

export async function findAdminByPlatformUserId(platformUserId: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .where({ platform_user_id: platformUserId, is_active: true })
    .whereNull("deleted_at")
    .first();
}

/** Unlike findAdminByPlatformUserId, includes suspended (is_active=false) rows — used at login to distinguish "not an admin" from "suspended admin". */
export async function findAdminByPlatformUserIdIncludingInactive(platformUserId: number) {
  return masterKnex<AdminUserRow>("superadmin.admin_users")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first();
}

export async function findAdminById(id: number) {
  return withUser(masterKnex<AdminUserRow>("superadmin.admin_users"))
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .where("superadmin.admin_users.id", id)
    .whereNull("superadmin.admin_users.deleted_at")
    .first();
}

export async function findAdminByEmail(email: string) {
  return withUser(masterKnex<AdminUserRow>("superadmin.admin_users"))
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .where("platform_users.email", email)
    .whereNull("superadmin.admin_users.deleted_at")
    .whereNull("platform_users.deleted_at")
    .first();
}

function adminListQuery(search?: string) {
  const q = withUser(masterKnex("superadmin.admin_users")).whereNull("superadmin.admin_users.deleted_at");
  if (search) {
    q.where((b: any) =>
      b
        .whereILike("platform_users.first_name", `%${search}%`)
        .orWhereILike("platform_users.last_name", `%${search}%`)
        .orWhereILike("platform_users.email", `%${search}%`),
    );
  }
  return q;
}

export async function listAdmins(limit: number, offset: number, search?: string) {
  return adminListQuery(search)
    .select(ADMIN_WITH_USER_COLUMNS as unknown as string[])
    .orderBy("superadmin.admin_users.id", "asc")
    .limit(limit)
    .offset(offset);
}

// ── Platform users (every signed-up account, not just admins) ──

const PLATFORM_USER_BASE_COLUMNS = [
  "id", "first_name", "last_name", "email", "phone", "account_status", "is_email_verified",
  "is_personal_account", "is_business_account", "is_institution_account", "created_at",
];

const PLATFORM_USER_COLUMNS = [
  ...PLATFORM_USER_BASE_COLUMNS.map((c) => `platform_users.${c}`),
  "superadmin.admin_users.role as admin_role",
  "platform_user_profiles.completion_percentage",
  "countries.name as country",
];

export type PlatformUserType = "personal" | "business" | "institution";

const PLATFORM_USER_TYPE_COLUMN: Record<PlatformUserType, string> = {
  personal: "is_personal_account",
  business: "is_business_account",
  institution: "is_institution_account",
};

function platformUserListQuery(search?: string, type?: PlatformUserType, adminOnly?: boolean) {
  const q = masterKnex("platform_users")
    .whereNull("platform_users.deleted_at")
    .leftJoin("superadmin.admin_users", (join) =>
      join
        .on("superadmin.admin_users.platform_user_id", "=", "platform_users.id")
        .andOnNull("superadmin.admin_users.deleted_at")
        .andOnVal("superadmin.admin_users.is_active", true),
    )
    .leftJoin("platform_user_profiles", "platform_user_profiles.user_id", "platform_users.id")
    .leftJoin("countries", "countries.id", "platform_user_profiles.country_of_residence_id");
  if (search) {
    q.where((b: any) =>
      b.whereILike("first_name", `%${search}%`).orWhereILike("last_name", `%${search}%`).orWhereILike("email", `%${search}%`),
    );
  }
  if (type) {
    q.where(`platform_users.${PLATFORM_USER_TYPE_COLUMN[type]}`, true);
  }
  if (adminOnly) {
    q.whereNotNull("superadmin.admin_users.role");
  }
  return q;
}

export async function listPlatformUsers(
  limit: number,
  offset: number,
  search?: string,
  type?: PlatformUserType,
  adminOnly?: boolean,
) {
  return platformUserListQuery(search, type, adminOnly)
    .select(PLATFORM_USER_COLUMNS)
    .orderBy("platform_users.id", "desc")
    .limit(limit)
    .offset(offset);
}

/** Promotes (or re-promotes) a platform user to an admin role — reactivates a suspended admin record if one exists. */
export async function upsertAdminForPlatformUser(platformUserId: number, role: string, addedBy: number) {
  const existing = await findAdminByPlatformUserIdIncludingInactive(platformUserId);
  if (existing) return updateAdmin(existing.id, { role, is_active: true });
  return insertAdmin({ platform_user_id: platformUserId, role, added_by: addedBy });
}

/** Revokes admin access for a platform user — no-op if they aren't currently an admin. */
export async function deactivateAdminForPlatformUser(platformUserId: number) {
  const existing = await findAdminByPlatformUserId(platformUserId);
  if (!existing) return null;
  return updateAdmin(existing.id, { is_active: false });
}

export async function countPlatformUsers(
  search?: string,
  type?: PlatformUserType,
  adminOnly?: boolean,
): Promise<number> {
  const [{ count }] = await platformUserListQuery(search, type, adminOnly).count("platform_users.id as count");
  return Number(count);
}

export async function updatePlatformUserStatus(
  id: number,
  data: { account_status?: number; is_email_verified?: boolean },
) {
  const [row] = await masterKnex("platform_users")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning(PLATFORM_USER_BASE_COLUMNS);
  return row;
}

export async function countAdmins(search?: string): Promise<number> {
  const [{ count }] = await adminListQuery(search).count("superadmin.admin_users.id as count");
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
    .whereNull("deleted_at")
    .first();
}

export async function markInvitationAccepted(id: string) {
  await masterKnex("superadmin.admin_invitations")
    .where({ id })
    .update({ status: "accepted" });
}

function invitationListQuery(search?: string) {
  const q = masterKnex("superadmin.admin_invitations").whereNull("deleted_at").where({ status: "pending" });
  if (search) {
    q.where((b) =>
      b.whereILike("first_name", `%${search}%`).orWhereILike("last_name", `%${search}%`).orWhereILike("email", `%${search}%`),
    );
  }
  return q;
}

export async function listInvitations(limit: number, offset: number, search?: string) {
  return invitationListQuery(search)
    .select("id", "email", "first_name", "last_name", "role", "status", "invited_by", "created_at", "expired_at")
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countInvitations(search?: string): Promise<number> {
  const [{ count }] = await invitationListQuery(search).count("id as count");
  return Number(count);
}

export async function findInvitationById(id: string) {
  return masterKnex<AdminInvitationRow>("superadmin.admin_invitations")
    .where({ id })
    .whereNull("deleted_at")
    .first();
}

export async function resendInvitationToken(id: string, token: string, expiredAt: Date) {
  await masterKnex("superadmin.admin_invitations")
    .where({ id })
    .update({ invite_token: token, expired_at: expiredAt });
}
