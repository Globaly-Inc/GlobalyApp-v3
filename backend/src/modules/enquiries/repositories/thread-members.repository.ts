// Per-thread membership — globalyapp.enquiry_thread_members.
//
// The Space model from GlobalyOS-V2's chat_space_members, keyed on the distribution because that
// row IS the thread in this system. Recipient-agnostic by construction: nothing here knows or
// cares whether the thread belongs to a business or an institution.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { recipientFilter, type Recipient } from "../shared/recipient.js";

const T = "enquiry_thread_members";

export type ThreadRole = "admin" | "member";

export interface ThreadMember {
  platform_user_id: number;
  role: ThreadRole;
  /**
   * 'auto' rows were placed by the system (owner, unlocker) and cannot be removed.
   *
   * 'student' is not a row in this table at all — it is the enquiry's own student, folded into the
   * roster by findThreadStudent so one list can show everyone in the conversation. Nothing can be
   * done to them here: they are a party to the enquiry, not a seat the agency administers, and
   * every mutation below resolves its target through findMembership and so cannot see them.
   */
  source: "auto" | "manual" | "student";
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  photo_url: string | null;
  created_at: Date;
}

/** The caller's own row, or undefined when they are not on this thread. */
export async function findMembership(
  distributionId: string,
  userId: number,
): Promise<{ role: ThreadRole; source: string } | undefined> {
  return masterKnex(T)
    .where({ distribution_id: distributionId, platform_user_id: userId })
    .first("role", "source");
}

/**
 * The thread's student, shaped as a ThreadMember so one roster can hold both parties.
 *
 * They are a participant by construction — the enquiry is theirs — rather than by a row in
 * `enquiry_thread_members`, which exists to model the seats an agency assigns internally. That is
 * why the roster showed everyone EXCEPT the person the conversation is with.
 *
 * `student_left_at` is honoured: a student who has left is no longer in the conversation, the same
 * way a departed agent stops appearing. Undefined then, and for a thread that was never unlocked.
 *
 * `created_at` is the distribution's, not the enquiry's — when this conversation began, which is
 * what the roster's oldest-first ordering means everywhere else.
 */
export async function findThreadStudent(distributionId: string): Promise<ThreadMember | undefined> {
  const row = await masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .join("platform_users as u", "u.id", "e.student_id")
    .where("d.id", distributionId)
    .whereNull("d.deleted_at")
    .whereNull("d.student_left_at")
    .whereNotNull("d.unlocked_at")
    .whereNull("u.deleted_at")
    .first(
      "u.id as platform_user_id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.photo_url",
      "d.created_at",
    );
  if (!row) return undefined;
  // Always 'member': the student administers nothing on the agency's side of the thread.
  return { ...row, role: "member", source: "student" } as ThreadMember;
}

export async function listMembers(distributionId: string): Promise<ThreadMember[]> {
  return masterKnex(`${T} as m`)
    .join("platform_users as u", "u.id", "m.platform_user_id")
    .where("m.distribution_id", distributionId)
    // Admins first, then oldest membership — the owner is the first name an agent looks for.
    .orderByRaw("case when m.role = 'admin' then 0 else 1 end, m.created_at asc")
    .select(
      "m.platform_user_id",
      "m.role",
      "m.source",
      "m.created_at",
      "u.first_name",
      "u.last_name",
      "u.email",
      "u.photo_url",
    ) as Promise<ThreadMember[]>;
}

/**
 * Seeds the two rows every unlocked thread starts with: the recipient's owner as admin, and
 * whoever paid as a member.
 *
 * Takes a transaction because it runs inside unlock's — an unlocked thread must never exist
 * without an admin, and a separate write could fail after the credits were spent.
 *
 * Owner first, then the unlocker: when they are the same person, ON CONFLICT DO NOTHING leaves
 * the 'admin' row alone rather than demoting them.
 */
export async function seedOnUnlock(
  trx: Knex.Transaction,
  distributionId: string,
  recipient: Recipient,
  unlockedBy: number,
): Promise<void> {
  const ownerRow =
    recipient.kind === "institution"
      ? await trx("institutions").where({ id: recipient.id }).first("platform_user_id as owner_id")
      : await trx("businesses").where({ id: recipient.id }).first("owner_id");
  const ownerId: number | null = ownerRow?.owner_id ?? null;

  const rows = [
    ...(ownerId ? [{ distribution_id: distributionId, platform_user_id: ownerId, role: "admin", source: "auto" }] : []),
    { distribution_id: distributionId, platform_user_id: unlockedBy, role: "member", source: "auto" },
  ];

  for (const row of rows) {
    await trx(T).insert(row).onConflict(["distribution_id", "platform_user_id"]).ignore();
  }
}

export async function addMembers(distributionId: string, userIds: number[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const inserted = await masterKnex(T)
    .insert(
      userIds.map((id) => ({
        distribution_id: distributionId,
        platform_user_id: id,
        role: "member",
        source: "manual",
      })),
    )
    .onConflict(["distribution_id", "platform_user_id"])
    .ignore()
    .returning("platform_user_id");
  return inserted.length;
}

/**
 * How many people are on this thread. Every row here is someone from the recipient org — the
 * student is deliberately not one (see the 20260901_001 migration) — so this IS the count of
 * business members, which is what the leave rules are written against.
 */
export async function countMembers(distributionId: string): Promise<number> {
  const [{ count }] = await masterKnex(T)
    .where({ distribution_id: distributionId })
    .count<Array<{ count: string }>>("* as count");
  return Number(count);
}

export async function removeMember(distributionId: string, userId: number): Promise<number> {
  return masterKnex(T).where({ distribution_id: distributionId, platform_user_id: userId }).delete();
}

export async function setRole(distributionId: string, userId: number, role: ThreadRole): Promise<number> {
  return masterKnex(T)
    .where({ distribution_id: distributionId, platform_user_id: userId })
    .update({ role, updated_at: masterKnex.fn.now() });
}

/**
 * True when this user is the thread's ONLY admin — so removing or demoting them would leave it
 * unadministered. Ported from GlobalyOS-V2's isLastAdminBlock, which the space and task-list
 * member routes both share.
 */
export async function isLastAdmin(distributionId: string, userId: number): Promise<boolean> {
  const [{ count }] = await masterKnex(T)
    .where({ distribution_id: distributionId, role: "admin" })
    .count<Array<{ count: string }>>("* as count");
  if (Number(count) > 1) return false;
  const target = await masterKnex(T)
    .where({ distribution_id: distributionId, platform_user_id: userId })
    .first("role");
  return target?.role === "admin";
}

/**
 * Staff who could be added — everyone in the recipient org who is not already on the thread.
 *
 * Reads the master-side membership index rather than a tenant `agents` table so one query serves
 * both recipient kinds, and so it works for an institution that has no agents table at all.
 */
export async function listCandidates(distributionId: string, recipient: Recipient) {
  const index = recipient.kind === "institution" ? "user_institution_index" : "user_business_index";
  const orgColumn = recipient.kind === "institution" ? "institution_id" : "business_id";

  return masterKnex(`${index} as idx`)
    .join("platform_users as u", "u.id", "idx.platform_user_id")
    .where(`idx.${orgColumn}`, recipient.id)
    .whereNull("idx.deleted_at")
    .whereNotExists(function () {
      this.select(1)
        .from(`${T} as m`)
        .whereRaw("m.platform_user_id = idx.platform_user_id")
        .andWhere("m.distribution_id", distributionId);
    })
    .orderBy(["u.first_name", "u.last_name"])
    .select("u.id as platform_user_id", "u.first_name", "u.last_name", "u.email", "u.photo_url");
}

/** Scopes a distribution to its owning recipient — the org check that precedes the member check. */
export async function findDistributionForRecipient(distributionId: string, recipient: Recipient) {
  return masterKnex("enquiry_distributions")
    .where({ id: distributionId, ...recipientFilter(recipient) })
    .whereNull("deleted_at")
    .first();
}
