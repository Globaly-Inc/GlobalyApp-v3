// user_business_index (memberships) + position confirmations into platform_user_work_experiences.

import { masterKnex } from "../../../core/db/master-pool.js";

export interface PositionUpdateRow {
  membership_id: number;
  business_id: number;
  business_name: string | null;
  position: string;
  confirmed_position: string | null;
  work_experience_id: string | null;
}

export async function findMembership(membershipId: number, platformUserId: number) {
  return masterKnex("user_business_index")
    .where({ id: membershipId, platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first() as Promise<Record<string, unknown> | undefined>;
}

export async function membershipExists(platformUserId: number, businessId: number) {
  const row = await masterKnex("user_business_index")
    .where({ platform_user_id: platformUserId, business_id: businessId })
    .whereNull("deleted_at")
    .first();
  return !!row;
}

/**
 * Positions needing the user's confirmation. Two cases, distinguished by `kind`:
 *  - "new"     — a position with no linked work-experience row yet
 *  - "changed" — a linked row whose confirmed_position no longer matches the membership's position,
 *                i.e. the position changed after an earlier confirmation
 */
export async function listPositionUpdates(platformUserId: number) {
  const rows = (await masterKnex("user_business_index as ubi")
    .leftJoin("businesses as b", "b.id", "ubi.business_id")
    .leftJoin("platform_user_work_experiences as we", function () {
      this.on("we.source_membership_id", "=", "ubi.id")
        .andOn("we.user_id", "=", masterKnex.raw("?", [platformUserId]))
        .andOnNull("we.deleted_at");
    })
    .where("ubi.platform_user_id", platformUserId)
    .whereNull("ubi.deleted_at")
    .whereNotNull("ubi.position")
    .select(
      "ubi.id as membership_id",
      "ubi.business_id",
      "ubi.position",
      "b.business_name",
      "we.id as work_experience_id",
      "we.confirmed_position",
    )
    .limit(20)) as PositionUpdateRow[];

  return rows
    .filter((r) => !r.work_experience_id || r.confirmed_position !== r.position)
    .map((r) => ({
      membership_id: r.membership_id,
      business_id: r.business_id,
      business_name: r.business_name,
      position: r.position,
      previous_position: r.work_experience_id ? r.confirmed_position : null,
      kind: r.work_experience_id ? ("changed" as const) : ("new" as const),
    }));
}

/** Idempotent on source_membership_id: inserts first time, updates the title on a later change. */
export async function confirmPosition(input: {
  platformUserId: number;
  membershipId: number;
  position: string;
  businessName: string | null;
}) {
  const existing = await masterKnex("platform_user_work_experiences")
    .where({ source_membership_id: input.membershipId, user_id: input.platformUserId })
    .whereNull("deleted_at")
    .first();

  if (existing) {
    if (existing.confirmed_position === input.position) return { changed: false };
    // A position change: retitle in place and keep the original start_date.
    await masterKnex("platform_user_work_experiences")
      .where({ id: existing.id })
      .update({
        job_title: input.position,
        confirmed_position: input.position,
        updated_at: masterKnex.fn.now(),
      });
    return { changed: true };
  }

  await masterKnex("platform_user_work_experiences").insert({
    user_id: input.platformUserId,
    job_title: input.position,
    organization_name: input.businessName,
    is_current: true,
    start_date: new Date().toISOString().slice(0, 10),
    source_membership_id: input.membershipId,
    confirmed_position: input.position,
  });
  return { changed: true };
}
