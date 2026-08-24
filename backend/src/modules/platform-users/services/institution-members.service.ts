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

import type { Knex } from "knex";
import * as repo from "../repositories/platform-users.repository.js";

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
