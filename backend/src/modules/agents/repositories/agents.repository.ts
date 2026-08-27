// Agent repository — queries against per-business DB agents/agent_invitations tables,
// plus business lookup in globalyapp. No auth fields — those live in platform_users.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";

export interface AgentRow {
  id: number;
  platform_user_id: number;
  role_id: number;
  role: string;
  role_display: string;
  is_owner: boolean;
  account_status: number;
  added_by: number | null;
  addedby_admin_id: number | null;
  admin_point_of_contact: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_public: boolean;
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface RoleRow {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface InvitationRow {
  id: string;
  email: string;
  user_details: Record<string, unknown> | null;
  invite_token: string;
  invited_by: number;
  status: string;
  created_at: Date;
  expired_at: Date;
}

const AGENT_COLUMNS = [
  "agents.id",
  "agents.platform_user_id",
  "agents.role_id",
  "roles.name as role",
  "roles.display_name as role_display",
  "agents.is_owner",
  "agents.account_status",
  "agents.added_by",
  "agents.addedby_admin_id",
  "agents.admin_point_of_contact",
  "agents.first_name",
  "agents.last_name",
  "agents.email",
  "agents.phone",
  "agents.position",
  "agents.is_public",
  "agents.meta",
  "agents.created_at",
  "agents.updated_at",
] as const;

function withRole(query: Knex.QueryBuilder) {
  return query.join("roles", "agents.role_id", "roles.id");
}

// ── Roles ──

export async function findRoleByName(db: Knex, name: string) {
  return db<RoleRow>("roles").where({ name }).whereNull("deleted_at").first();
}

export async function listRoles(db: Knex) {
  return db<RoleRow>("roles").whereNull("deleted_at").orderBy("sort_order", "asc");
}

export async function findRoleById(db: Knex, id: number) {
  return db<RoleRow>("roles").where({ id }).whereNull("deleted_at").first();
}

export interface PermissionRow {
  id: number;
  module: string;
  action: string;
  display_name: string;
  description: string | null;
}

export async function listPermissions(db: Knex) {
  return db<PermissionRow>("permissions")
    .whereNull("deleted_at")
    .select("id", "module", "action", "display_name", "description")
    .orderBy(["module", "id"]);
}

/** All role→permission links, for building permission_ids arrays per role in one query. */
export async function listRolePermissionLinks(db: Knex): Promise<{ role_id: number; permission_id: number }[]> {
  return db("role_permissions").select("role_id", "permission_id");
}

/** Which tenant schema the roles tables live in: business (agents/role_id) or institution (members/role name). */
export type TenantKind = "business" | "institution";

/** Members per role_id (soft-deleted agents excluded), for "in use" counts. */
export async function countAgentsPerRole(db: Knex): Promise<{ role_id: number; count: string }[]> {
  return db("agents").whereNull("deleted_at").groupBy("role_id").select("role_id").count("id as count");
}

/** Institution counterpart — members reference roles by NAME (members.role text), not role_id. */
export async function countMembersPerRoleName(db: Knex): Promise<{ role: string; count: string }[]> {
  return db("members").whereNull("deleted_at").groupBy("role").select("role").count("id as count");
}

export async function countAgentsWithRole(db: Knex, roleId: number): Promise<number> {
  const [{ count }] = await db("agents").where({ role_id: roleId }).whereNull("deleted_at").count("id as count");
  return Number(count);
}

export async function countMembersWithRoleName(db: Knex, roleName: string): Promise<number> {
  const [{ count }] = await db("members").where({ role: roleName }).whereNull("deleted_at").count("id as count");
  return Number(count);
}

/** Pending invitations that would resolve to this role name on accept. */
export async function countPendingInvitationsWithRole(db: Knex, kind: TenantKind, roleName: string): Promise<number> {
  const table = kind === "institution" ? "member_invitations" : "agent_invitations";
  const [{ count }] = await db(table)
    .where({ status: "pending" })
    .whereNull("deleted_at")
    .whereRaw("user_details->>'role' = ?", [roleName])
    .count("id as count");
  return Number(count);
}

export async function insertRole(db: Knex, data: {
  name: string;
  display_name: string;
  description?: string | null;
  is_system: boolean;
  sort_order: number;
}) {
  const [row] = await db<RoleRow>("roles")
    .insert({ ...data, created_at: db.fn.now(), updated_at: db.fn.now() } as any)
    .returning("*");
  return row;
}

export async function updateRoleRow(db: Knex, id: number, data: {
  display_name?: string;
  description?: string | null;
}) {
  const [row] = await db<RoleRow>("roles")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: db.fn.now() } as any)
    .returning("*");
  return row;
}

export async function softDeleteRole(db: Knex, id: number) {
  await db("roles").where({ id }).update({ deleted_at: db.fn.now() });
}

/** Replace-all semantics: the payload's permission_ids is the full desired set. */
export async function setRolePermissions(db: Knex, roleId: number, permissionIds: number[]) {
  await db.transaction(async (trx) => {
    await trx("role_permissions").where({ role_id: roleId }).delete();
    if (permissionIds.length > 0) {
      await trx("role_permissions").insert(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
    }
  });
}

export async function maxRoleSortOrder(db: Knex): Promise<number> {
  const row = await db("roles").whereNull("deleted_at").max("sort_order as max").first();
  return Number(row?.max ?? 0);
}

// ── Business lookup (globalyapp) ──

export async function findBusinessByDbName(dbName: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ schema_name: dbName, account_status: 1 }).whereNull("deleted_at").first();
}

// ── Agent queries (per-business DB) ──

export async function findAgentByPlatformUserId(db: Knex, platformUserId: number) {
  return withRole(db<AgentRow>("agents"))
    .select(AGENT_COLUMNS as unknown as string[])
    .where("agents.platform_user_id", platformUserId)
    .whereNull("agents.deleted_at")
    .first();
}

export async function findAgentById(db: Knex, id: number) {
  return withRole(db<AgentRow>("agents"))
    .select(AGENT_COLUMNS as unknown as string[])
    .where("agents.id", id)
    .whereNull("agents.deleted_at")
    .first();
}

export async function findOwnerAgent(db: Knex) {
  return withRole(db<AgentRow>("agents"))
    .select(AGENT_COLUMNS as unknown as string[])
    .where("agents.is_owner", true)
    .whereNull("agents.deleted_at")
    .first();
}

/** Count agents flagged as super admin's point of contact, optionally excluding one agent. */
export async function countPointOfContactAgents(db: Knex, excludeId?: number): Promise<number> {
  const query = db("agents").where({ admin_point_of_contact: true }).whereNull("deleted_at");
  if (excludeId !== undefined) query.whereNot("id", excludeId);
  const [{ count }] = await query.count("id as count");
  return Number(count);
}

export async function insertAgent(db: Knex, data: {
  platform_user_id: number;
  role_id: number;
  is_owner: boolean;
  account_status: number;
  added_by?: number | null;
  addedby_admin_id?: number | null;
  admin_point_of_contact?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
}) {
  const [row] = await db("agents")
    .insert({ ...data, created_at: db.fn.now(), updated_at: db.fn.now() })
    .returning("*");
  const role = await db<RoleRow>("roles").where({ id: row.role_id }).first();
  return { ...row, role: role!.name, role_display: role!.display_name };
}

export async function updateAgent(db: Knex, id: number, data: {
  role_id?: number;
  admin_point_of_contact?: boolean;
  account_status?: number;
  is_owner?: boolean;
  position?: string | null;
  is_public?: boolean;
}) {
  const [row] = await db("agents")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: db.fn.now() })
    .returning("*");
  if (!row) return undefined;
  const role = await db<RoleRow>("roles").where({ id: row.role_id }).first();
  return { ...row, role: role!.name, role_display: role!.display_name };
}

export async function softDeleteAgent(db: Knex, id: number) {
  await db("agents").where({ id }).update({ deleted_at: db.fn.now() });
}

function applyAgentSearch(query: Knex.QueryBuilder, search?: string): Knex.QueryBuilder {
  if (!search) return query;
  return query.where((qb) => {
    qb.whereILike("agents.first_name", `%${search}%`)
      .orWhereILike("agents.last_name", `%${search}%`)
      .orWhereILike("agents.email", `%${search}%`);
  });
}

export async function listAgents(db: Knex, limit: number, offset: number, search?: string) {
  return applyAgentSearch(
    withRole(db<AgentRow>("agents")).whereNull("agents.deleted_at"),
    search,
  )
    .select(AGENT_COLUMNS as unknown as string[])
    .orderBy("agents.id", "asc")
    .limit(limit)
    .offset(offset);
}

export async function countAgents(db: Knex, search?: string): Promise<number> {
  const [{ count }] = await applyAgentSearch(db("agents").whereNull("deleted_at"), search).count("id as count");
  return Number(count);
}

// ── Invitations ──

export async function insertInvitation(db: Knex, data: {
  email: string;
  user_details: Record<string, unknown>;
  invite_token: string;
  invited_by: number;
  status: string;
  expired_at: Date;
}) {
  const [row] = await db<InvitationRow>("agent_invitations")
    .insert({ ...data, created_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function findPendingInvitationByEmail(db: Knex, email: string) {
  return db<InvitationRow>("agent_invitations")
    .where({ email, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function findInvitationByToken(db: Knex, token: string) {
  return db<InvitationRow>("agent_invitations")
    .where({ invite_token: token, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function markInvitationAccepted(db: Knex, id: string) {
  await db("agent_invitations").where({ id }).update({ status: "accepted" });
}

export async function listPendingInvitations(db: Knex, limit: number, offset: number) {
  return db<InvitationRow>("agent_invitations")
    .where({ status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countPendingInvitations(db: Knex): Promise<number> {
  const [{ count }] = await db("agent_invitations")
    .where({ status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .count("id as count");
  return Number(count);
}

export async function findPendingInvitationById(db: Knex, id: string) {
  return db<InvitationRow>("agent_invitations")
    .where({ id, status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .first();
}

/** Unlike findPendingInvitationById, doesn't require the invite to still be unexpired —
 * resending is exactly what you'd do to fix an invite that's about to or already did expire. */
export async function findInvitationById(db: Knex, id: string) {
  return db<InvitationRow>("agent_invitations")
    .where({ id, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function refreshInvitationToken(db: Knex, id: string, token: string, expiredAt: Date) {
  await db("agent_invitations").where({ id }).update({ invite_token: token, expired_at: expiredAt });
}

export async function cancelInvitation(db: Knex, id: string) {
  await db("agent_invitations").where({ id }).update({ deleted_at: db.fn.now() });
}
