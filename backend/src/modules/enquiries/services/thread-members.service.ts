// Membership management for an enquiry thread — the Space admin's controls.
//
// Ported from GlobalyOS-V2's chat-members routes, minus the parts that do not apply: there is no
// auto-sync scope here (a thread's audience is the org that paid for it, not an office or
// project), and no org-admin override (a business owner IS the admin of every thread their
// business unlocks).
//
// What is kept verbatim, because both were learned the hard way there:
//   - the last-admin guard, so a thread can never end up with nobody able to manage it
//   - a system message on every change, so the roster's history lives in the thread itself
//     rather than only in an audit table nobody reads

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as mediaService from "./message-media.service.js";
import * as repo from "../repositories/thread-members.repository.js";
import { logEnquiryAudit } from "../shared/audit.js";
import type { Recipient } from "../shared/recipient.js";

/**
 * Resolves the thread for this caller and returns their role.
 *
 * Org first, then membership — a distribution belonging to another org and one this caller is
 * simply not on both come back as 404. Neither should confirm the thread exists.
 */
async function requireMember(distributionId: string, recipient: Recipient, userId: number) {
  const distribution = await repo.findDistributionForRecipient(distributionId, recipient);
  if (!distribution) throw new NotFoundError("Conversation not found");
  if (distribution.unlocked_at == null) throw new NotFoundError("Conversation not found");
  const membership = await repo.findMembership(distributionId, userId);
  if (!membership) throw new NotFoundError("Conversation not found");
  return { distribution, role: membership.role };
}

/** 403, not 404: a member already knows the thread exists, so hiding it would just confuse. */
async function requireAdmin(distributionId: string, recipient: Recipient, userId: number) {
  const ctx = await requireMember(distributionId, recipient, userId);
  if (ctx.role !== "admin") throw new ForbiddenError("Only the thread admin can manage members");
  return ctx;
}

function fullName(row: { first_name?: string | null; last_name?: string | null }): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Someone";
}

/**
 * Writes one thread event — "Bo was invited by Ada" — into the conversation itself, so the roster's
 * history lives where people read it rather than only in an audit table nobody opens.
 *
 * Sent as the acting admin rather than a system account: `enquiry_messages.sender_id` is a real
 * platform user with a NOT NULL foreign key, and there is no system user to attribute it to. The
 * `kind` is what stops it rendering as a bubble from that person, and what picks the icon.
 *
 * Wording is subject-first and passive — the person it HAPPENED to leads, the actor trails. That is
 * GlobalyOS's phrasing, and it is the right one: scanning the list you are looking for a name, and
 * the name you are looking for is the one it was done to.
 *
 * Best-effort — a failed notice must not undo a membership change that already committed.
 *
 * Announce rows written before migration 20260901_002 default to 'message' and keep rendering as
 * bubbles. Not backfilled: the only way to find them is to pattern-match their body, which would
 * also catch anyone who happened to type the same sentence.
 */
async function announce(
  distributionId: string,
  actorId: number,
  kind: messagesRepo.MessageKind,
  body: string,
): Promise<void> {
  await messagesRepo.insert({ distribution_id: distributionId, sender_id: actorId, body, kind }).catch(() => {});
}

/**
 * What still stands between this member and the door, as a list of things they must do first.
 * Empty means they can leave.
 *
 * An OPEN lead must never be left unattended, so two invariants hold while it is:
 *   - somebody from the org is still on it, and
 *   - somebody on it can still administer it.
 * The last person out would break the first; the last admin out would break the second. Someone
 * who is both — the usual case for a thread of one — trips both and has to fix both.
 *
 * Once the enquiry is CLOSED neither invariant is worth anything: there is no lead left to work,
 * so the thread is allowed to empty out completely.
 *
 * One function, two callers on purpose. listMembers reports it so the panel can explain itself and
 * leave() enforces it, which is the only way the button and the endpoint cannot drift apart.
 */
async function leaveBlockers(distributionId: string, userId: number, status: string): Promise<string[]> {
  if (status === "closed") return [];

  const blockers: string[] = [];
  if ((await repo.countMembers(distributionId)) <= 1) {
    blockers.push("add someone else from your organisation to this conversation");
  }
  if (await repo.isLastAdmin(distributionId, userId)) {
    blockers.push("make another member an admin");
  }
  return blockers;
}

/** The one sentence the panel shows and the API throws — written once so they cannot disagree. */
function blockerMessage(blockers: string[]): string {
  return `Before you can leave this conversation you need to ${blockers.join(", and ")}.`;
}

export async function listMembers(distributionId: string, recipient: Recipient, userId: number) {
  const { distribution, role } = await requireMember(distributionId, recipient, userId);
  const members = await repo.listMembers(distributionId);
  const blockers = await leaveBlockers(distributionId, userId, distribution.status);
  return {
    // Echoed back so the client does not have to find itself in the list to know what it may do.
    my_role: role,
    // …and WHICH row is itself, so the roster can offer "Leave" on your own line and the manage
    // actions on everyone else's. Deriving it client-side would mean trusting the access token's
    // `sub` to agree with what this endpoint scoped to, which is one assumption too many.
    my_user_id: userId,
    can_manage: role === "admin",
    can_leave: blockers.length === 0,
    /** Null when they can leave. Otherwise exactly what leave() would throw. */
    leave_blocked_reason: blockers.length > 0 ? blockerMessage(blockers) : null,
    members: await Promise.all(
      members.map(async (m) => ({ ...m, photo_url: await storage.resolvePreviewUrl(m.photo_url) })),
    ),
  };
}

/** How long a thread name may be. Long enough for "Sharma — Feb intake, deferred", not a message. */
const MAX_TITLE = 100;

/**
 * Renames the thread for EVERYONE on it, the student included.
 *
 * Admin only, like every other change to what the thread is rather than to what is in it. A blank
 * title clears it back to null, which is what makes each side fall back to its own default label —
 * the student to the agency's name, the agency to the student's. See the 20260901_003 migration.
 *
 * Lives here rather than in distributions.service because the gate is thread-admin, and this is the
 * module that knows what that means.
 */
export async function renameThread(
  distributionId: string,
  recipient: Recipient,
  userId: number,
  rawTitle: string | null,
): Promise<{ title: string | null }> {
  await requireAdmin(distributionId, recipient, userId);

  const title = rawTitle?.trim() ? rawTitle.trim().slice(0, MAX_TITLE) : null;
  await messagesRepo.setTitle(distributionId, title);

  const actor = await masterKnex("platform_users").where({ id: userId }).first("first_name", "last_name");
  await announce(
    distributionId,
    userId,
    "renamed",
    title
      ? `This conversation was renamed to "${title}" by ${fullName(actor ?? {})}`
      : `This conversation's name was removed by ${fullName(actor ?? {})}`,
  );
  await logEnquiryAudit(userId, "thread.renamed", {
    entityType: "distribution",
    entityId: distributionId,
    details: { title },
  });

  return { title };
}

/**
 * Sets the thread's shared picture, or clears it.
 *
 * Two-step like a message attachment: the file goes up through the existing
 * `/enquiry-distributions/messages/media` endpoint, and this stores the path it handed back. That
 * is why `resolveOwned` runs — without it a client could point the thread at ANY storage path it
 * could guess, and every member and the student would be served a signed URL for it. The guard is
 * the same one attaching a file to a message uses.
 *
 * Images only. The upload endpoint accepts PDFs and video too, since it also serves attachments.
 */
export async function setPhoto(
  distributionId: string,
  recipient: Recipient,
  userId: number,
  photoPath: string | null,
): Promise<{ thread_photo: string | null }> {
  await requireAdmin(distributionId, recipient, userId);

  if (photoPath) {
    const [file] = await mediaService.resolveOwned(userId, [photoPath]);
    if (!file.mime_type.startsWith("image/")) throw new BadRequestError("A conversation photo must be an image");
  }

  await messagesRepo.setPhoto(distributionId, photoPath);

  const actor = await masterKnex("platform_users").where({ id: userId }).first("first_name", "last_name");
  await announce(
    distributionId,
    userId,
    "photo_changed",
    photoPath
      ? `This conversation's photo was changed by ${fullName(actor ?? {})}`
      : `This conversation's photo was removed by ${fullName(actor ?? {})}`,
  );
  await logEnquiryAudit(userId, "thread.photo_changed", {
    entityType: "distribution",
    entityId: distributionId,
    details: { cleared: photoPath === null },
  });

  return { thread_photo: photoPath ? await storage.resolvePreviewUrl(photoPath) : null };
}

/**
 * This member walks away from the thread.
 *
 * Not `removeMember` with the target set to yourself: that one refuses 'auto' rows, because an
 * admin must not be able to eject the owner or the agent who paid. Leaving is your own decision
 * about your own membership, and leaveBlockers already protects what actually needs protecting.
 */
export async function leave(distributionId: string, recipient: Recipient, userId: number): Promise<void> {
  const { distribution } = await requireMember(distributionId, recipient, userId);

  const blockers = await leaveBlockers(distributionId, userId, distribution.status);
  if (blockers.length > 0) throw new ConflictError(blockerMessage(blockers));

  await repo.removeMember(distributionId, userId);

  const actor = await masterKnex("platform_users").where({ id: userId }).first("first_name", "last_name");
  await announce(distributionId, userId, "member_left", `${fullName(actor ?? {})} left the conversation`);
  await logEnquiryAudit(userId, "thread.member_left", {
    entityType: "distribution",
    entityId: distributionId,
    details: { enquiry_status: distribution.status },
  });
}

/**
 * The student's side of the same door.
 *
 * They hold no `enquiry_thread_members` row, so leaving sets `student_left_at` on the distribution
 * instead — see the 20260901_003 migration for why it hangs there.
 *
 * The rule is simpler and stricter than the business's: a student cannot abandon a live enquiry
 * they themselves raised, because the agency working it would be left answering nobody. Once the
 * business closes it there is nothing left to answer, and they may go.
 */
export async function leaveAsStudent(distributionId: string, studentId: number): Promise<void> {
  const ctx = await messagesRepo.findThreadContext(distributionId);
  // Same 404-for-everything convention as the rest of the module: not theirs, not yet unlocked and
  // already left must not be distinguishable from does-not-exist.
  if (!ctx || ctx.student_id !== studentId || ctx.unlocked_at == null || ctx.student_left_at != null) {
    throw new NotFoundError("Conversation not found");
  }
  if (ctx.status !== "closed") {
    throw new ConflictError("You can leave this conversation once the business has closed your enquiry.");
  }

  await messagesRepo.markStudentLeft(distributionId);

  const student = await masterKnex("platform_users").where({ id: studentId }).first("first_name", "last_name");
  await announce(distributionId, studentId, "member_left", `${fullName(student ?? {})} left the conversation`);
  await logEnquiryAudit(studentId, "thread.student_left", {
    entityType: "distribution",
    entityId: distributionId,
    details: { enquiry_id: ctx.enquiry_id },
  });
}

export async function listCandidates(distributionId: string, recipient: Recipient, userId: number) {
  await requireAdmin(distributionId, recipient, userId);
  const rows = await repo.listCandidates(distributionId, recipient);
  return Promise.all(rows.map(async (r) => ({ ...r, photo_url: await storage.resolvePreviewUrl(r.photo_url) })));
}

export async function addMembers(
  distributionId: string,
  recipient: Recipient,
  actorId: number,
  userIds: number[],
) {
  await requireAdmin(distributionId, recipient, actorId);
  if (userIds.length === 0) throw new BadRequestError("Select at least one person to add");

  // Only people already in this org. Without this an admin could add any platform user by id —
  // including a student — straight into a thread they have no business reading.
  const allowed = await repo.listCandidates(distributionId, recipient);
  const allowedIds = new Set(allowed.map((c) => Number(c.platform_user_id)));
  const invalid = userIds.filter((id) => !allowedIds.has(id));
  if (invalid.length > 0) throw new BadRequestError("Some of those people are not in this organisation");

  const added = await repo.addMembers(distributionId, userIds);

  const actor = await masterKnex("platform_users").where({ id: actorId }).first("first_name", "last_name");
  const names = allowed.filter((c) => userIds.includes(Number(c.platform_user_id))).map(fullName);
  if (added > 0) {
    // One row per person, not one row listing everyone: each is its own event in the timeline, and
    // "A, B and C were invited" reads worse than three lines you can scan for a name.
    for (const name of names) {
      await announce(distributionId, actorId, "member_added", `${name} was invited by ${fullName(actor ?? {})}`);
    }
    await logEnquiryAudit(actorId, "thread.members_added", {
      entityType: "distribution",
      entityId: distributionId,
      details: { added: userIds },
    });
  }
  return { added };
}

export async function removeMember(
  distributionId: string,
  recipient: Recipient,
  actorId: number,
  targetId: number,
) {
  await requireAdmin(distributionId, recipient, actorId);

  const target = await repo.findMembership(distributionId, targetId);
  if (!target) throw new NotFoundError("That person is not in this conversation");
  // 'auto' members are the owner and whoever paid for the unlock — the two people the thread
  // structurally belongs to. Removing either would leave a lead nobody owns.
  if (target.source === "auto") {
    throw new ConflictError("The thread owner and the agent who unlocked it cannot be removed");
  }
  if (await repo.isLastAdmin(distributionId, targetId)) {
    throw new ConflictError("This conversation would be left without an admin");
  }

  await repo.removeMember(distributionId, targetId);

  const [actor, removed] = await Promise.all([
    masterKnex("platform_users").where({ id: actorId }).first("first_name", "last_name"),
    masterKnex("platform_users").where({ id: targetId }).first("first_name", "last_name"),
  ]);
  await announce(
    distributionId,
    actorId,
    "member_removed",
    `${fullName(removed ?? {})} was removed by ${fullName(actor ?? {})}`,
  );
  await logEnquiryAudit(actorId, "thread.member_removed", {
    entityType: "distribution",
    entityId: distributionId,
    details: { removed: targetId },
  });
}

export async function setRole(
  distributionId: string,
  recipient: Recipient,
  actorId: number,
  targetId: number,
  role: "admin" | "member",
) {
  await requireAdmin(distributionId, recipient, actorId);

  const target = await repo.findMembership(distributionId, targetId);
  if (!target) throw new NotFoundError("That person is not in this conversation");
  if (target.role === role) return;
  // Demotion is the risky direction: promotion can never orphan a thread.
  if (role === "member" && (await repo.isLastAdmin(distributionId, targetId))) {
    throw new ConflictError("This conversation would be left without an admin");
  }

  await repo.setRole(distributionId, targetId, role);

  const [actor, changed] = await Promise.all([
    masterKnex("platform_users").where({ id: actorId }).first("first_name", "last_name"),
    masterKnex("platform_users").where({ id: targetId }).first("first_name", "last_name"),
  ]);
  await announce(
    distributionId,
    actorId,
    role === "admin" ? "admin_granted" : "admin_revoked",
    role === "admin"
      ? `${fullName(changed ?? {})} was made an admin by ${fullName(actor ?? {})}`
      : `${fullName(changed ?? {})} is no longer an admin (changed by ${fullName(actor ?? {})})`,
  );
  await logEnquiryAudit(actorId, "thread.member_role_changed", {
    entityType: "distribution",
    entityId: distributionId,
    details: { target: targetId, role },
  });
}
