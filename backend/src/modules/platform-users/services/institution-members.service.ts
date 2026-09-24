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
import { NotFoundError, ConflictError, UnauthorizedError, BadRequestError } from "../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import type { ContactInput, ContactPatch } from "../../agents/schemas/agents.schema.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { queueInvitationEmail } from "../../auth/auth.service.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as invitesRepo from "../repositories/institution-invitations.repository.js";
import * as agentsRepo from "../../agents/repositories/agents.repository.js";
import type { RoleCreateInput, RolePatchInput } from "../../agents/schemas/agents.schema.js";

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
      // Accepting an invite makes this a real member — clears is_contact_only so it lands in
      // Users. Deliberately NOT touching admin_point_of_contact: a pre-existing "Add Contact"
      // row may already have that flag, and accepting an invite shouldn't remove them from the
      // Contacts tab too — they can be both a real user and a point of contact at once.
      is_contact_only: false,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
    })
    .onConflict("platform_user_id")
    .merge({
      role: input.role, is_owner: isOwner, account_status: 1, is_contact_only: false, deleted_at: null,
      // Explicit resets, not omissions — a soft-deleted former member or a dormant "Add Contact"
      // row being resurrected here must not keep its stale CRM data. An old is_primary: true is
      // reset too, so accepting a real invite can't collide with another member's primary flag
      // (addMember never calls a resetPrimaryMembers-equivalent since a fresh accept is never
      // itself flagged primary through the invite).
      job_title: null, department: null, linkedin_url: null, other_url: null,
      tags: [], preferred_channel: null, is_primary: false, notes: null,
    });

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
  "first_name", "last_name", "email", "phone", "created_at", "updated_at",
  "admin_point_of_contact", "job_title", "department", "linkedin_url", "other_url",
  "tags", "preferred_channel", "is_primary", "notes",
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
  updated_at: Date;
  admin_point_of_contact: boolean;
  is_contact_only: boolean;
  job_title: string | null;
  department: string | null;
  linkedin_url: string | null;
  other_url: string | null;
  tags: string[];
  preferred_channel: string | null;
  is_primary: boolean;
  notes: string | null;
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
      admin_point_of_contact: member.admin_point_of_contact,
      position: null,
      is_public: true,
      created_at: member.created_at,
      updated_at: member.updated_at,
      first_name: user?.first_name ?? member.first_name,
      last_name: user?.last_name ?? member.last_name,
      email: user?.email ?? member.email,
      phone: user?.phone ?? member.phone,
      photo_url: user?.photo_url ?? null,
      job_title: member.job_title,
      department: member.department,
      linkedin_url: member.linkedin_url,
      other_url: member.other_url,
      tags: member.tags ?? [],
      preferred_channel: member.preferred_channel,
      is_primary: member.is_primary,
      notes: member.notes,
    };
  });
}

function applyMemberSearch(query: Knex.QueryBuilder, search?: string): Knex.QueryBuilder {
  if (!search) return query;
  return query.where((qb) => {
    qb.whereILike("first_name", `%${search}%`)
      .orWhereILike("last_name", `%${search}%`)
      .orWhereILike("email", `%${search}%`);
  });
}

/** Self-service member list — the institution twin of agents.service.ts's listAgents. */
export async function listMembers(tenantDb: Knex, pagination: PaginationInput, search?: string) {
  const { limit, offset } = paginationToOffset(pagination);
  // Excludes rows that have never been through a real invite-accept (is_contact_only) — a
  // dormant "Add Contact" row. A row that HAS accepted an invite shows here even if it's also
  // flagged admin_point_of_contact — Contacts and Users aren't mutually exclusive.
  const excludeContacts = { is_contact_only: false };
  const [rows, [{ count }]] = await Promise.all([
    applyMemberSearch(tenantDb<MemberRow>("members").whereNull("deleted_at").where(excludeContacts), search)
      .select(MEMBER_COLUMNS as unknown as (keyof MemberRow)[])
      .orderBy("id", "asc")
      .limit(limit)
      .offset(offset),
    applyMemberSearch(tenantDb("members").whereNull("deleted_at").where(excludeContacts), search).count("id as count"),
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

/** Suspend/reinstate a member — account_status only, same 0/1 convention as agents. Mirrored onto
 * user_institution_index too: that's what resolveOrgScope/listUserInstitutions actually reads on
 * login, so without this a suspended member could still log in and still had this institution in
 * their session scope. */
export async function setMemberStatus(tenantDb: Knex, institutionId: number, platformUserId: number, accountStatus: number) {
  const member = await tenantDb("members")
    .where({ platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first("id", "is_owner");
  if (!member) throw new NotFoundError("Member not found");
  if (member.is_owner && accountStatus !== 1) throw new ConflictError("Cannot suspend the institution owner");
  await tenantDb("members").where({ id: member.id }).update({ account_status: accountStatus, updated_at: tenantDb.fn.now() });
  await repo.setUserInstitutionIndexStatus(platformUserId, institutionId, accountStatus);
}

/** Patches the contact/CRM fields on a member row (job_title, department, etc — everything
 * PATCH /:id needs beyond role/account_status, which updateMemberRole/setMemberStatus already
 * cover). Keyed by members.id, mirroring agents.service.ts's updateAgent. */
export async function updateMemberDetails(tenantDb: Knex, id: number, patch: {
  admin_point_of_contact?: boolean;
  job_title?: string | null;
  department?: string | null;
  linkedin_url?: string | null;
  other_url?: string | null;
  tags?: string[];
  preferred_channel?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}) {
  if (Object.keys(patch).length === 0) return;
  await tenantDb("members").where({ id }).whereNull("deleted_at").update({ ...patch, updated_at: tenantDb.fn.now() });
}

// ── Contacts ("Add Contact" — a dormant member row, not a separate table) ──
// Institution twin of agents.service.ts's contact functions — same `members` table the Users
// tab already reads, just viewed/created through a CRM-shaped form. No invite email is sent.

function splitFullName(fullName: string): { first_name: string; last_name: string | null } {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return { first_name: first ?? fullName, last_name: rest.length > 0 ? rest.join(" ") : null };
}

function toContact(member: any) {
  return {
    id: String(member.id),
    full_name: [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email || "",
    job_title: member.job_title ?? null,
    department: member.department ?? null,
    email: member.email ?? null,
    phone: member.phone ?? null,
    phone_country_code: null, // ponytail: not tracked separately on members — phone is stored combined
    linkedin_url: member.linkedin_url ?? null,
    other_url: member.other_url ?? null,
    tags: member.tags ?? [],
    preferred_channel: member.preferred_channel ?? null,
    is_primary: member.is_primary ?? false,
    notes: member.notes ?? null,
    created_at: member.created_at,
    updated_at: member.updated_at,
  };
}

async function resetPrimaryMembers(tenantDb: Knex, excludeId?: number) {
  const query = tenantDb("members").where({ is_primary: true }).whereNull("deleted_at");
  if (excludeId !== undefined) query.whereNot("id", excludeId);
  await query.update({ is_primary: false });
}

/** Contacts view of the same members list — all members, primary first. */
export async function listContacts(tenantDb: Knex, limit: number, offset: number, search?: string) {
  const [rows, [{ count }]] = await Promise.all([
    applyMemberSearch(tenantDb<MemberRow>("members").whereNull("deleted_at").where({ admin_point_of_contact: true }), search)
      .select(MEMBER_COLUMNS as unknown as (keyof MemberRow)[])
      .orderBy("is_primary", "desc")
      .orderBy("first_name", "asc")
      .limit(limit)
      .offset(offset),
    applyMemberSearch(tenantDb("members").whereNull("deleted_at").where({ admin_point_of_contact: true }), search).count("id as count"),
  ]);
  const enriched = await enrichMembers(rows);
  return { rows: enriched.map(toContact), total: Number(count) };
}

/** "Add Contact" — finds or silently creates a dormant platform_user (account_status 0, no
 * OTP/invite email), then a real member row for them with role "member", is_owner false. */
export async function createContact(tenantDb: Knex, institutionId: number, input: ContactInput) {
  let platformUser = await repo.findByEmail(input.email);
  if (!platformUser) {
    const { first_name, last_name } = splitFullName(input.full_name);
    platformUser = await repo.insert({
      first_name,
      last_name: last_name ?? "",
      email: input.email,
      account_status: 0, // dormant — no OTP/invite email sent
    });
  } else {
    const existing = await invitesRepo.findMemberByPlatformUserId(tenantDb, platformUser.id);
    if (existing) throw new ConflictError("A member/contact with this email already exists");
  }

  if (input.is_primary) await resetPrimaryMembers(tenantDb);

  const { first_name, last_name } = splitFullName(input.full_name);
  const [row] = await tenantDb("members")
    .insert({
      platform_user_id: platformUser.id,
      role: "member",
      is_owner: false,
      account_status: 1,
      // Contacts default to being a point of contact — see listContacts (only shows POC rows).
      admin_point_of_contact: true,
      // Not yet a real member — excluded from Users (listMembers) until they accept a real
      // invite (addMember clears this), independent of the POC flag above.
      is_contact_only: true,
      first_name,
      last_name,
      email: platformUser.email,
      phone: input.phone ?? null,
      job_title: input.job_title ?? null,
      department: input.department ?? null,
      linkedin_url: input.linkedin_url ?? null,
      other_url: input.other_url ?? null,
      tags: input.tags ?? [],
      preferred_channel: input.preferred_channel ?? null,
      is_primary: input.is_primary ?? false,
      notes: input.notes ?? null,
      created_at: tenantDb.fn.now(),
      updated_at: tenantDb.fn.now(),
    })
    .returning("*");

  // Deliberately NOT writing user_institution_index here — same reasoning as agents.service.ts's
  // createContact: that index is what login reads to grant org access, and a dormant contact-only
  // row (especially for an already-existing, active platformUser found by email above) must not
  // get it without ever being invited/accepting. Written only on real invite acceptance.

  return toContact(row);
}

export async function updateContact(tenantDb: Knex, id: number, patch: ContactPatch) {
  const existing = await tenantDb<MemberRow>("members").where({ id }).whereNull("deleted_at").first();
  if (!existing) throw new NotFoundError("Contact not found");

  if (patch.is_primary) await resetPrimaryMembers(tenantDb, id);

  const nameFields = patch.full_name !== undefined ? splitFullName(patch.full_name) : {};
  await tenantDb("members").where({ id }).update({
    ...nameFields,
    ...(patch.job_title !== undefined ? { job_title: patch.job_title } : {}),
    ...(patch.department !== undefined ? { department: patch.department } : {}),
    ...(patch.linkedin_url !== undefined ? { linkedin_url: patch.linkedin_url } : {}),
    ...(patch.other_url !== undefined ? { other_url: patch.other_url } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.preferred_channel !== undefined ? { preferred_channel: patch.preferred_channel } : {}),
    ...(patch.is_primary !== undefined ? { is_primary: patch.is_primary } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    updated_at: tenantDb.fn.now(),
  });
  const [row] = await tenantDb<MemberRow>("members").where({ id }).select(MEMBER_COLUMNS as unknown as (keyof MemberRow)[]);
  const [enriched] = await enrichMembers([row]);
  return toContact(enriched);
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
  invitedByMemberId: number | null,
) {
  const existingUser = await repo.findByEmail(input.email);
  if (existingUser) {
    const existingMember = await invitesRepo.findMemberByPlatformUserId(tenantDb, existingUser.id);
    // A dormant "Add Contact" row (is_contact_only, never accepted an invite) isn't a real
    // member yet — inviting them is how they become one. addMember upserts on platform_user_id,
    // so it safely promotes this same row rather than erroring on a duplicate. Only a genuine
    // already-accepted member blocks a re-invite.
    if (existingMember && !existingMember.is_contact_only) {
      throw new ConflictError("User is already a member of this institution");
    }
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

/** An institution's own owner inviting a teammate (agents.routes.ts self-service path) —
 * attributed to that owner's member row, which must already exist since they're the one calling. */
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

/** A platform Super Admin inviting a member on the institution's behalf (superadmin platform
 * businesses.service.ts) — unlike the self-service path above, the institution may not have an
 * owner member yet at all (e.g. it was created directly by staff and never claimed/onboarded), so
 * this doesn't require one: invited_by is attributed to the existing owner when there is one, and
 * left null otherwise rather than blocking the very first invite an institution ever gets. */
export async function inviteMemberAsSuperadmin(
  tenantDb: Knex,
  institutionId: number,
  institutionSchemaName: string,
  input: InstitutionInviteInput,
) {
  const owner = await invitesRepo.findOwnerMember(tenantDb);
  return createInvitation(tenantDb, institutionId, institutionSchemaName, input, owner?.id ?? null);
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

// ── Roles (institution twin of agents.service.ts role functions) ──
// `roles`, `permissions`, `role_permissions` are standalone tables in the institution tenant schema.
// They are NOT joined to `members.role` (which stays as a text column for simplicity).
// These functions manage the custom-role/permission definitions; member assignment uses the
// text role name on the `members` row directly (same as before).

function slugifyRoleName(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_/, "").replace(/_$/, "");
}

async function assertPermissionIdsExist(db: Knex, ids: number[]) {
  if (ids.length === 0) return;
  const found = await db("permissions").whereIn("id", ids).whereNull("deleted_at").pluck("id");
  const missing = ids.filter((id) => !found.includes(id));
  if (missing.length > 0) throw new BadRequestError(`Unknown permission ids: ${missing.join(", ")}`);
}

async function roleWithDetails(db: Knex, role: agentsRepo.RoleRow) {
  const [links, membersCount] = await Promise.all([
    db("role_permissions").where({ role_id: role.id }).pluck("permission_id"),
    // members.role is still text — count by matching name
    db("members").where({ role: role.name }).whereNull("deleted_at").count("id as count").then(([r]: any[]) => Number(r.count)),
  ]);
  return { ...role, permission_ids: links as number[], members_count: membersCount };
}

export async function listRolesWithDetails(tenantDb: Knex) {
  const [roles, links] = await Promise.all([
    agentsRepo.listRoles(tenantDb),
    agentsRepo.listRolePermissionLinks(tenantDb),
  ]);
  // Count members per role name (text column)
  const roleCounts = await tenantDb("members")
    .whereNull("deleted_at")
    .groupBy("role")
    .select("role")
    .count("id as count") as { role: string; count: string }[];

  const permsByRole = new Map<number, number[]>();
  for (const link of links) {
    const list = permsByRole.get(link.role_id) ?? [];
    list.push(link.permission_id);
    permsByRole.set(link.role_id, list);
  }
  const countByRoleName = new Map(roleCounts.map((c) => [c.role, Number(c.count)]));

  return roles.map((role) => ({
    ...role,
    permission_ids: permsByRole.get(role.id) ?? [],
    members_count: countByRoleName.get(role.name) ?? 0,
  }));
}

export async function listPermissions(tenantDb: Knex) {
  return agentsRepo.listPermissions(tenantDb);
}

export async function createRole(tenantDb: Knex, input: RoleCreateInput) {
  const name = slugifyRoleName(input.display_name);
  if (!name) throw new BadRequestError("Role name must contain letters or numbers");

  const existing = await agentsRepo.findRoleByName(tenantDb, name);
  if (existing) throw new ConflictError(`A role named "${existing.display_name}" already exists`);

  await assertPermissionIdsExist(tenantDb, input.permission_ids);

  const sortOrder = (await agentsRepo.maxRoleSortOrder(tenantDb)) + 1;
  const role = await agentsRepo.insertRole(tenantDb, {
    name,
    display_name: input.display_name.trim(),
    description: input.description ?? null,
    is_system: false,
    sort_order: sortOrder,
  });
  await agentsRepo.setRolePermissions(tenantDb, role.id, input.permission_ids);
  return roleWithDetails(tenantDb, role);
}

export async function updateRole(tenantDb: Knex, id: number, patch: RolePatchInput) {
  const role = await agentsRepo.findRoleById(tenantDb, id);
  if (!role) throw new NotFoundError("Role not found");
  if (role.is_system) throw new ConflictError("System roles cannot be modified");

  if (patch.permission_ids !== undefined) {
    await assertPermissionIdsExist(tenantDb, patch.permission_ids);
    await agentsRepo.setRolePermissions(tenantDb, id, patch.permission_ids);
  }

  let updated = role;
  if (patch.display_name !== undefined || patch.description !== undefined) {
    updated = (await agentsRepo.updateRoleRow(tenantDb, id, {
      ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    }))!;
  }
  return roleWithDetails(tenantDb, updated);
}

export async function deleteRole(tenantDb: Knex, id: number) {
  const role = await agentsRepo.findRoleById(tenantDb, id);
  if (!role) throw new NotFoundError("Role not found");
  if (role.is_system) throw new ConflictError("System roles cannot be deleted");

  const [membersCount, pendingCount] = await Promise.all([
    tenantDb("members").where({ role: role.name }).whereNull("deleted_at").count("id as count").then(([r]: any[]) => Number(r.count)),
    tenantDb("member_invitations")
      .where({ status: "pending" })
      .whereNull("deleted_at")
      .whereRaw("user_details->>'role' = ?", [role.name])
      .count("id as count")
      .then(([r]: any[]) => Number(r.count)),
  ]);
  if (membersCount > 0) throw new ConflictError(`Role is assigned to ${membersCount} member(s) — reassign them first`);
  if (pendingCount > 0) throw new ConflictError(`Role is used by ${pendingCount} pending invitation(s) — cancel or wait for them first`);

  await agentsRepo.softDeleteRole(tenantDb, id);
}
