// Institution member invitations — tenant `member_invitations` table.
// Byte-for-byte the same shape as businesses' `agent_invitations`; see agents.repository.ts.

import type { Knex } from "knex";

export interface InstitutionInvitationRow {
  id: string;
  email: string;
  user_details: Record<string, unknown> | null;
  invite_token: string;
  invited_by: number;
  status: string;
  created_at: Date;
  expired_at: Date;
}

export async function findOwnerMember(db: Knex) {
  return db("members").where({ is_owner: true }).whereNull("deleted_at").first();
}

export async function findMemberByPlatformUserId(db: Knex, platformUserId: number) {
  return db("members").where({ platform_user_id: platformUserId }).whereNull("deleted_at").first();
}

export async function insertInvitation(db: Knex, data: {
  email: string;
  user_details: Record<string, unknown>;
  invite_token: string;
  invited_by: number;
  status: string;
  expired_at: Date;
}) {
  const [row] = await db<InstitutionInvitationRow>("member_invitations")
    .insert({ ...data, created_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function findPendingInvitationByEmail(db: Knex, email: string) {
  return db<InstitutionInvitationRow>("member_invitations")
    .where({ email, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function findInvitationByToken(db: Knex, token: string) {
  return db<InstitutionInvitationRow>("member_invitations")
    .where({ invite_token: token, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function markInvitationAccepted(db: Knex, id: string) {
  await db("member_invitations").where({ id }).update({ status: "accepted" });
}

export async function listPendingInvitations(db: Knex, limit: number, offset: number) {
  return db<InstitutionInvitationRow>("member_invitations")
    .where({ status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countPendingInvitations(db: Knex): Promise<number> {
  const [{ count }] = await db("member_invitations")
    .where({ status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .count("id as count");
  return Number(count);
}

export async function findPendingInvitationById(db: Knex, id: string) {
  return db<InstitutionInvitationRow>("member_invitations")
    .where({ id, status: "pending" })
    .where("expired_at", ">", db.fn.now())
    .whereNull("deleted_at")
    .first();
}

/** Unlike findPendingInvitationById, doesn't require the invite to still be unexpired —
 * resending is exactly what you'd do to fix an invite that's about to or already did expire. */
export async function findInvitationById(db: Knex, id: string) {
  return db<InstitutionInvitationRow>("member_invitations")
    .where({ id, status: "pending" })
    .whereNull("deleted_at")
    .first();
}

export async function refreshInvitationToken(db: Knex, id: string, token: string, expiredAt: Date) {
  await db("member_invitations").where({ id }).update({ invite_token: token, expired_at: expiredAt });
}

export async function cancelInvitation(db: Knex, id: string) {
  await db("member_invitations").where({ id }).update({ deleted_at: db.fn.now() });
}
