// Institution membership writes — THE only place institution membership should be changed.
//
// Every institution membership lives in TWO tables and they must move together:
//
//   <tenant>.members          authoritative for role — requireInstitutionRole reads it
//   user_institution_index    master-DB lookup — login reads it to build institutions[]
//                             and to sign orgRole
//
// Write only `members` and the user can never enter the institution: login cannot scan tenant
// schemas, so an unindexed member is invisible. Write only the index and every role check
// fails. Neither failure throws — they just silently do the wrong thing.
//
// So: go through these functions. Do not insert into `members` or user_institution_index
// directly. Today's callers are onboardInstitution and acceptInstitutionClaim; when member
// invitations land, their accept path calls addMember too.
//
// This is the same invariant user_business_index carries for businesses, where it is enforced
// by convention across four call sites instead. Institutions get a choke point from the start.

import { randomBytes } from "node:crypto";
import type { Knex } from "knex";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import { NotFoundError, ConflictError, UnauthorizedError } from "../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { queueInvitationEmail } from "../../auth/auth.service.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as invitesRepo from "../repositories/institution-invitations.repository.js";

const logger = createChildLogger("institution-members-service");
const INVITE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours, matching the agent invite flow

export interface InstitutionMemberInput {
  platform_user_id: number;
  role: string;
  is_owner?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Add or re-add a member. Idempotent on both sides: `members.platform_user_id` is unique so a
 * retry is a no-op, and the index upserts on (user, institution) while clearing any tombstone
 * from a previous removal.
 */
export async function addMember(tenantDb: Knex, institutionId: number, input: InstitutionMemberInput) {
  const isOwner = input.is_owner ?? false;

  await tenantDb("members")
    .insert({
      platform_user_id: input.platform_user_id,
      role: input.role,
      is_owner: isOwner,
      account_status: 1,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
    })
    .onConflict("platform_user_id")
    .merge({ role: input.role, is_owner: isOwner, account_status: 1, deleted_at: null });

  await repo.insertUserInstitutionIndex({
    platform_user_id: input.platform_user_id,
    institution_id: institutionId,
    role: input.role,
    is_owner: isOwner,
  });

  await repo.updateUser(input.platform_user_id, { is_institution_account: true });
}

/** Change a member's role on both sides. */
export async function updateMemberRole(
  tenantDb: Knex,
  institutionId: number,
  platformUserId: number,
  role: string,
) {
  const updated = await tenantDb("members")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .update({ role, updated_at: tenantDb.fn.now() });
  if (updated === 0) return false;

  await repo.insertUserInstitutionIndex({
    platform_user_id: platformUserId,
    institution_id: institutionId,
    role,
    is_owner: false, // ownership transfer is a separate operation, not a role edit
  });
  return true;
}

/** Remove a member from both sides. Soft delete, mirroring softDeleteAgent. */
export async function removeMember(tenantDb: Knex, institutionId: number, platformUserId: number) {
  const member = await tenantDb("members")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first("id", "is_owner");
  if (!member) return false;
  // The owner is the institution's anchor — institutions.platform_user_id FKs them.
  if (member.is_owner) return false;

  await tenantDb("members").where({ id: member.id }).update({ deleted_at: tenantDb.fn.now() });
  await repo.softDeleteUserInstitutionIndex(platformUserId, institutionId);
  return true;
}

const MEMBER_COLUMNS = [
  "id", "platform_user_id", "role", "is_owner", "account_status",
  "first_name", "last_name", "email", "phone", "created_at",
] as const;

interface MemberRow {
  id: number;
  platform_user_id: number;
  role: string;
  is_owner: boolean;
  account_status: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: Date;
}

/** Shapes a `members` row to the same field names as businesses' agent list (role_id/role_display/
 * admin_point_of_contact/position/is_public/photo_url don't exist for institutions — plain
 * defaults), and re-enriches name/contact/photo from platform_users, mirroring agents' enrichAgents
 * so a stale denormalized snapshot on `members` never shows instead of the live profile. */
async function enrichMembers(members: MemberRow[]) {
  if (members.length === 0) return [];
  const ids = members.map((m) => m.platform_user_id as number);
  const users = await masterKnex("platform_users")
    .whereIn("id", ids)
    .select("id", "first_name", "last_name", "email", "phone", "photo_url");
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  return members.map((member) => {
    const user = userMap.get(member.platform_user_id as number);
    return {
      id: member.id,
      platform_user_id: member.platform_user_id,
      role_id: 0,
      role: member.role,
      role_display: member.role,
      is_owner: member.is_owner,
      account_status: member.account_status,
      admin_point_of_contact: false,
      position: null,
      is_public: true,
      created_at: member.created_at,
      first_name: user?.first_name ?? member.first_name,
      last_name: user?.last_name ?? member.last_name,
      email: user?.email ?? member.email,
      phone: user?.phone ?? member.phone,
      photo_url: user?.photo_url ?? null,
    };
  });
}

/** Self-service member list — the institution twin of agents.service.ts's listAgents. */
export async function listMembers(tenantDb: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, [{ count }]] = await Promise.all([
    tenantDb<MemberRow>("members")
      .whereNull("deleted_at")
      .select(MEMBER_COLUMNS as unknown as (keyof MemberRow)[])
      .orderBy("id", "asc")
      .limit(limit)
      .offset(offset),
    tenantDb("members").whereNull("deleted_at").count("id as count"),
  ]);
  const enriched = await enrichMembers(rows);
  return buildPaginatedResponse(enriched, Number(count), pagination);
}

/** Self-service single-member lookup — the institution twin of agents.service.ts's getAgent. */
export async function getMember(tenantDb: Knex, id: number) {
  const row = await tenantDb<MemberRow>("members")
    .where({ id })
    .whereNull("deleted_at")
    .select(MEMBER_COLUMNS as unknown as (keyof MemberRow)[])
    .first();
  if (!row) throw new NotFoundError("Member not found");
  const [enriched] = await enrichMembers([row]);
  return enriched;
}

/** Suspend/reinstate a member — account_status only, same 0/1 convention as agents. */
export async function setMemberStatus(tenantDb: Knex, platformUserId: number, accountStatus: number) {
  const member = await tenantDb("members")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first("id", "is_owner");
  if (!member) throw new NotFoundError("Member not found");
  if (member.is_owner && accountStatus !== 1) throw new ConflictError("Cannot suspend the institution owner");
  await tenantDb("members").where({ id: member.id }).update({ account_status: accountStatus, updated_at: tenantDb.fn.now() });
}

// ── Invitations ("invited but not yet accepted" members) — mirrors agents.service.ts ──

function toInvitedMember(row: invitesRepo.InstitutionInvitationRow) {
  const details = (row.user_details ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    first_name: (details.first_name as string) ?? null,
    last_name: (details.last_name as string) ?? null,
    email: row.email,
    phone: (details.phone as string) ?? null,
    role: (details.role as string) ?? null,
    invited_at: row.created_at,
    expires_at: row.expired_at,
  };
}

export async function listInvitations(tenantDb: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    invitesRepo.listPendingInvitations(tenantDb, limit, offset),
    invitesRepo.countPendingInvitations(tenantDb),
  ]);
  return buildPaginatedResponse(rows.map(toInvitedMember), total, pagination);
}

export async function cancelInvitation(tenantDb: Knex, id: string) {
  const invitation = await invitesRepo.findPendingInvitationById(tenantDb, id);
  if (!invitation) throw new NotFoundError("Invitation not found");
  await invitesRepo.cancelInvitation(tenantDb, id);
}

/** Rotates the invite token/expiry and re-sends the invite email — works even on an
 * already-expired invitation, since that's exactly when a resend is needed. */
export async function resendInvitation(tenantDb: Knex, id: string, institutionSchemaName: string) {
  const invitation = await invitesRepo.findInvitationById(tenantDb, id);
  if (!invitation) throw new NotFoundError("Invitation not found");

  const details = (invitation.user_details ?? {}) as Record<string, unknown>;
  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
  await invitesRepo.refreshInvitationToken(tenantDb, id, token, expiredAt);

  const acceptUrl = `${config.WEB_APP_URL}/invite/institution-member/accept?token=${token}&org_id=${institutionSchemaName}`;
  queueInvitationEmail({
    to: invitation.email,
    name: (details.first_name as string) ?? "",
    role: (details.role as string) ?? "member",
    acceptUrl,
  }).catch((err) => logger.warn("Resend institution invitation email failed", { email: invitation.email, err: err.message }));
}

export interface InstitutionInviteInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
}

async function createInvitation(
  tenantDb: Knex,
  institutionId: number,
  institutionSchemaName: string,
  input: InstitutionInviteInput,
  invitedByMemberId: number,
) {
  const existingUser = await repo.findByEmail(input.email);
  if (existingUser) {
    const existingMember = await invitesRepo.findMemberByPlatformUserId(tenantDb, existingUser.id);
    if (existingMember) throw new ConflictError("User is already a member of this institution");
  }

  const pending = await invitesRepo.findPendingInvitationByEmail(tenantDb, input.email);
  if (pending) throw new ConflictError("Invitation already pending for this email");

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
  const invitation = await invitesRepo.insertInvitation(tenantDb, {
    email: input.email,
    user_details: { first_name: input.first_name, last_name: input.last_name, phone: input.phone ?? null, role: input.role },
    invite_token: token,
    invited_by: invitedByMemberId,
    status: "pending",
    expired_at: expiredAt,
  });

  const acceptUrl = `${config.WEB_APP_URL}/invite/institution-member/accept?token=${token}&org_id=${institutionSchemaName}`;
  // ponytail: fire-and-forget — invitation must not fail because email is down
  queueInvitationEmail({
    to: input.email,
    name: input.first_name,
    role: input.role,
    acceptUrl,
  }).catch((err) => logger.warn("Institution invitation email failed (invitation created)", { email: input.email, err: err.message }));

  logger.info("Institution member invitation sent", { email: input.email, institutionId });
  return invitation;
}

export async function inviteMemberAsAdmin(
  tenantDb: Knex,
  institutionId: number,
  institutionSchemaName: string,
  input: InstitutionInviteInput,
) {
  const owner = await invitesRepo.findOwnerMember(tenantDb);
  if (!owner) throw new NotFoundError("Institution owner member not found");
  return createInvitation(tenantDb, institutionId, institutionSchemaName, input, owner.id);
}

export async function acceptMemberInvitation(institutionSchemaName: string, token: string) {
  const institution = await repo.findInstitutionBySchemaName(institutionSchemaName);
  if (!institution) throw new NotFoundError("Organization not found");
  const tenantDb = await getKnex(institution.id, institution.schema_name);

  const invitation = await invitesRepo.findInvitationByToken(tenantDb, token);
  if (!invitation) throw new NotFoundError("Invitation not found or already used");
  if (new Date() > invitation.expired_at) throw new UnauthorizedError("Invitation has expired");

  const details = (invitation.user_details ?? {}) as Record<string, string>;
  const roleName = details.role ?? "member";

  let platformUser = await repo.findByEmail(invitation.email);
  platformUser ??= await repo.insert({
    first_name: details.first_name || "",
    last_name: details.last_name || "",
    email: invitation.email,
    phone: details.phone || undefined,
    account_status: 0, // inactive until they verify OTP
  });

  await addMember(tenantDb, Number(institution.id), {
    platform_user_id: platformUser.id,
    role: roleName,
    is_owner: false,
    first_name: platformUser.first_name,
    last_name: platformUser.last_name,
    email: platformUser.email,
    phone: platformUser.phone,
  });

  await invitesRepo.markInvitationAccepted(tenantDb, invitation.id);
  await repo.updateUser(platformUser.id, { is_institution_account: true });
  await repo.addAccountCategory(platformUser.id, { type: "institution", role: roleName });

  logger.info("Institution member invitation accepted", { institutionId: institution.id, platformUserId: platformUser.id });
  return {
    message: "Invitation accepted. Log in with your email to access this institution.",
    org_id: institution.schema_name,
  };
}
