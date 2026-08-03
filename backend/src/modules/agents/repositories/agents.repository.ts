// Agent repository — queries against per-business DB agents/agent_invitations tables,
// plus business lookup in globalyapp.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";

export interface AgentRow {
  id: number;
  uuid: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  email: string;
  phone: string | null;
  username: string;
  role_id: number;
  role: string;          // joined from roles.name
  role_display: string;  // joined from roles.display_name
  refresh_token: string | null;
  otp: string | null;
  otp_expires_at: Date | null;
  account_status: number;
  photo_url: string | null;
  is_owner: boolean;
  added_by: number | null;
  is_email_verified: boolean;
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

const SAFE_COLUMNS = [
  "agents.id",
  "agents.uuid",
  "agents.first_name",
  "agents.last_name",
  "agents.display_name",
  "agents.email",
  "agents.phone",
  "agents.username",
  "agents.role_id",
  "roles.name as role",
  "roles.display_name as role_display",
  "agents.account_status",
  "agents.photo_url",
  "agents.is_owner",
  "agents.added_by",
  "agents.is_email_verified",
  "agents.meta",
  "agents.created_at",
  "agents.updated_at",
] as const;

function withRole(query: Knex.QueryBuilder) {
  return query.join("roles", "agents.role_id", "roles.id");
}

// ── Role queries ──

export async function findRoleByName(db: Knex, name: string) {
  return db<RoleRow>("roles").where({ name }).first();
}

export async function listRoles(db: Knex) {
  return db<RoleRow>("roles").orderBy("sort_order", "asc");
}

// ── Business lookup (globalyapp) ──

export async function findBusinessBySubdomain(
  subdomain: string,
): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses")
    .where({ subdomain, account_status: 1 })
    .first();
}

export async function findBusinessById(
  id: string,
): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses").where({ id }).first();
}

// ── Agent queries (per-business DB) ──

export async function findAgentByEmail(db: Knex, email: string) {
  return withRole(db<AgentRow>("agents"))
    .select("agents.*", "roles.name as role", "roles.display_name as role_display")
    .where("agents.email", email)
    .first();
}

export async function findAgentById(db: Knex, id: number) {
  return withRole(db<AgentRow>("agents"))
    .select(SAFE_COLUMNS as unknown as string[])
    .where("agents.id", id)
    .first();
}

export async function findAgentByIdFull(db: Knex, id: number) {
  return withRole(db<AgentRow>("agents"))
    .select("agents.*", "roles.name as role", "roles.display_name as role_display")
    .where("agents.id", id)
    .first();
}

export async function insertAgent(
  db: Knex,
  data: {
    first_name: string;
    last_name: string;
    email: string;
    username: string;
    role_id: number;
    account_status: number;
    is_owner: boolean;
    added_by?: number;
  },
) {
  const [row] = await db("agents")
    .insert({ ...data, created_at: db.fn.now(), updated_at: db.fn.now() })
    .returning("*");
  // attach role name
  const role = await db<RoleRow>("roles").where({ id: row.role_id }).first();
  return { ...row, role: role!.name, role_display: role!.display_name };
}

export async function updateOtp(db: Knex, agentId: number, otp: string, expiresAt: Date) {
  await db("agents")
    .where({ id: agentId })
    .update({ otp, otp_expires_at: expiresAt, updated_at: db.fn.now() });
}

export async function clearOtp(db: Knex, agentId: number) {
  await db("agents")
    .where({ id: agentId })
    .update({ otp: null, otp_expires_at: null, updated_at: db.fn.now() });
}

export async function updateRefreshToken(db: Knex, agentId: number, token: string | null) {
  await db("agents")
    .where({ id: agentId })
    .update({ refresh_token: token, updated_at: db.fn.now() });
}

export async function findAgentByRefreshToken(db: Knex, token: string) {
  return withRole(db<AgentRow>("agents"))
    .select("agents.*", "roles.name as role", "roles.display_name as role_display")
    .where("agents.refresh_token", token)
    .first();
}

export async function listAgents(db: Knex, limit: number, offset: number) {
  return withRole(db<AgentRow>("agents"))
    .select(SAFE_COLUMNS as unknown as string[])
    .orderBy("agents.id", "asc")
    .limit(limit)
    .offset(offset);
}

export async function countAgents(db: Knex): Promise<number> {
  const [{ count }] = await db("agents").count("id as count");
  return Number(count);
}

// ── Invitations ──

export async function insertInvitation(
  db: Knex,
  data: {
    email: string;
    user_details: Record<string, unknown>;
    invite_token: string;
    invited_by: number;
    status: string;
    expired_at: Date;
  },
) {
  const [row] = await db<InvitationRow>("agent_invitations")
    .insert({ ...data, created_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function findInvitationByToken(db: Knex, token: string) {
  return db<InvitationRow>("agent_invitations")
    .where({ invite_token: token, status: "pending" })
    .first();
}

export async function markInvitationAccepted(db: Knex, id: string) {
  await db("agent_invitations")
    .where({ id })
    .update({ status: "accepted" });
}
