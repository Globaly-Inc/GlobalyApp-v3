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

export async function insertAgent(db: Knex, data: {
  platform_user_id: number;
  role_id: number;
  is_owner: boolean;
  account_status: number;
  added_by?: number;
}) {
  const [row] = await db("agents")
    .insert({ ...data, created_at: db.fn.now(), updated_at: db.fn.now() })
    .returning("*");
  const role = await db<RoleRow>("roles").where({ id: row.role_id }).first();
  return { ...row, role: role!.name, role_display: role!.display_name };
}

export async function listAgents(db: Knex, limit: number, offset: number) {
  return withRole(db<AgentRow>("agents"))
    .select(AGENT_COLUMNS as unknown as string[])
    .whereNull("agents.deleted_at")
    .orderBy("agents.id", "asc")
    .limit(limit)
    .offset(offset);
}

export async function countAgents(db: Knex): Promise<number> {
  const [{ count }] = await db("agents").whereNull("deleted_at").count("id as count");
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
