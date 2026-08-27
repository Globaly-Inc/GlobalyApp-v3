// Enquiry chat — the conversation a business gets for unlocking a lead.
//
// Shaped after other-services/services/orders.service.ts, which is the closest working
// analogue in this codebase (a buyer↔seller thread hanging off one parent row).
//
// Authorization is ASYMMETRIC, which is why there is no single assertParticipant():
//   - the student is the enquiry's owner, identified by platform_users.id
//   - the business is identified by businesses.id, and agent membership was already
//     proven upstream by requireBusinessContext + requirePermission
// Both funnel into loadThread()/appendMessage() so the gating below can only be
// written once.

import type { Knex } from "knex";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as media from "./message-media.service.js";
import { markInConversation } from "./tenant-sync.service.js";
import { recipientOf, sameRecipient, type Recipient } from "../shared/recipient.js";

export type SenderRole = "student" | "business";

/**
 * The opening message posted on the business's behalf the moment it unlocks a lead, so
 * the student sees the conversation has started rather than an empty box.
 *
 * Deliberately generic: the thread header already names the business and the course, and
 * personalising it would mean joining the student and course rows inside the unlock
 * transaction for text nobody reads twice.
 *
 * ponytail: one fixed greeting for everyone — swap for a per-business template column if
 * businesses ask to customise it.
 */
export const UNLOCK_GREETING =
  "Hi! Thanks for your enquiry — we've unlocked it and we're happy to help. Ask us anything here and we'll get back to you shortly.";

export interface EnquiryMessageDto {
  id: number;
  body: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
  /** Signed URL, or null when the sender has no photo — the UI falls back to an initial. */
  sender_avatar: string | null;
  is_mine: boolean;
  /** Which side sent it. Derived, never stored — see the migration. */
  sender_role: SenderRole;
  /** This viewer's personal bookmark on this message — see enquiry_message_stars. */
  is_starred: boolean;
  /** Pinned to the conversation. Shared by both sides, unlike is_starred. */
  is_pinned: boolean;
  /** Files sent with the message, each carrying a freshly signed view URL. */
  attachments: media.MessageAttachmentDto[];
  /** Set when this message is a thread reply. Threads are one level deep. */
  reply_to_id: number | null;
  /** Replies anchored to this message — drives the "N replies" link. */
  reply_count: number;
  /** One entry per distinct emoji, newest-reacted last. */
  reactions: MessageReaction[];
  /** Set once the sender edited it — the UI shows V2's "(edited)" marker. */
  edited_at: string | null;
}

/** A reaction chip: the emoji, who used it, and whether the viewer is among them. */
export interface MessageReaction {
  emoji: string;
  count: number;
  /** Names, for the chip's tooltip — V2 shows the reactors on hover. */
  users: string[];
  /** Whether the viewer reacted, which is what tints the chip. */
  mine: boolean;
}

/** Groups raw reaction rows into per-message chip lists. */
function groupReactions(rows: messagesRepo.ReactionRow[], viewerUserId: number): Map<number, MessageReaction[]> {
  const byMessage = new Map<number, Map<string, MessageReaction>>();
  for (const row of rows) {
    const forMessage = byMessage.get(row.message_id) ?? new Map<string, MessageReaction>();
    const chip = forMessage.get(row.emoji) ?? { emoji: row.emoji, count: 0, users: [], mine: false };
    chip.count += 1;
    chip.users.push(row.reactor_name);
    if (row.user_id === viewerUserId) chip.mine = true;
    forMessage.set(row.emoji, chip);
    byMessage.set(row.message_id, forMessage);
  }
  return new Map([...byMessage].map(([id, chips]) => [id, [...chips.values()]]));
}

type ThreadContext = {
  distribution_id: string;
  // Exactly one is set — a distribution belongs to a business or, via the fallback, to an
  // institution. Use `recipientOf(ctx)` rather than reading either directly.
  business_id: number | null;
  institution_id: number | null;
  status: string;
  unlocked_at: Date | null;
  enquiry_id: string;
  student_id: number;
};

/**
 * A non-participant gets 404, not 403 — same call as orders.service's
 * assertParticipant and distributions.repository's findForBusinessForUpdate. A 403
 * would confirm the thread exists to someone with no business knowing that.
 */
async function loadThread(distributionId: string): Promise<ThreadContext> {
  const ctx = (await messagesRepo.findThreadContext(distributionId)) as ThreadContext | undefined;
  if (!ctx) throw new NotFoundError("Conversation not found");
  return ctx;
}

async function assertStudentParticipant(distributionId: string, userId: number): Promise<ThreadContext> {
  const ctx = await loadThread(distributionId);
  if (ctx.student_id !== userId) throw new NotFoundError("Conversation not found");
  return ctx;
}

async function assertBusinessParticipant(distributionId: string, recipient: Recipient): Promise<ThreadContext> {
  const ctx = await loadThread(distributionId);
  if (!sameRecipient(recipientOf(ctx), recipient)) throw new NotFoundError("Conversation not found");
  return ctx;
}

/**
 * A participant check for one thread, already bound to who is asking.
 *
 * The asymmetry described at the top of this file is real — a student proves membership
 * by owning the enquiry, a business by being the distribution's business — but it is the
 * only thing that differs between the two sides of most operations. Passing the check in
 * as a closure keeps that difference at the call site, so `edit`, `delete`, `star`,
 * `pin`, `react` and the thread helpers are each written once for both sides instead of
 * twice with one line changed.
 */
type Guard = (distributionId: string) => Promise<ThreadContext>;

const asStudent =
  (userId: number): Guard =>
  (distributionId) =>
    assertStudentParticipant(distributionId, userId);

const asBusiness =
  (recipient: Recipient): Guard =>
  (distributionId) =>
    assertBusinessParticipant(distributionId, recipient);

/** A message in a thread the caller belongs to. Used by star/pin/react. */
async function loadMessageThread(messageId: number, guard: Guard): Promise<ThreadContext> {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  return guard(message.distribution_id);
}

/**
 * A message the caller WROTE, in a thread they belong to and which is still open —
 * the gate edit and delete share.
 */
async function loadOwnMessage(messageId: number, userId: number, guard: Guard): Promise<ThreadContext> {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await guard(message.distribution_id);
  assertWritable(ctx);
  // Being in the thread is not enough — you may only edit what you wrote. 404 rather
  // than 403, matching how a non-participant is treated: no confirmation it exists.
  if (message.sender_id !== userId) throw new NotFoundError("Message not found");
  return ctx;
}

function toDto(
  row: messagesRepo.EnquiryMessageRow,
  viewerUserId: number,
  studentId: number,
  senderAvatar: string | null,
  isStarred = false,
  attachments: media.MessageAttachmentDto[] = [],
  replyCount = 0,
  reactions: MessageReaction[] = [],
): EnquiryMessageDto {
  return {
    id: row.id,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_avatar: senderAvatar,
    is_mine: row.sender_id === viewerUserId,
    sender_role: row.sender_id === studentId ? "student" : "business",
    is_starred: isStarred,
    is_pinned: row.pinned_at != null,
    attachments,
    reply_to_id: row.reply_to_id,
    reply_count: replyCount,
    reactions,
    edited_at: row.edited_at ? new Date(row.edited_at).toISOString() : null,
  };
}

/**
 * The thread is only readable once it exists, and it comes into existence by being
 * paid for. Before that there is nothing to show either side — an unpaid business must
 * not get a channel to the student, which is the whole point of the paywall.
 */
function assertUnlocked(ctx: ThreadContext, side: SenderRole): void {
  if (ctx.unlocked_at != null) return;
  throw new ConflictError(
    side === "student"
      ? "This conversation opens once a business unlocks your enquiry"
      : "Unlock this enquiry to start a conversation",
  );
}

/** Closed is read-only: the history stays, but the conversation is over. */
function assertWritable(ctx: ThreadContext): void {
  if (ctx.status === "closed") {
    throw new ConflictError("This enquiry is closed — the conversation is read-only");
  }
}

async function appendMessage(
  ctx: ThreadContext,
  senderUserId: number,
  body: string,
  attachmentPaths: string[] = [],
  replyToId: number | null = null,
): Promise<EnquiryMessageDto> {
  // Text or files, one of them. enquiry_messages_body_chk enforces the same thing, but a
  // constraint violation surfaces as an opaque 500 — this is the layer that owns the rule,
  // so it is the layer that names it.
  if (!body.trim() && attachmentPaths.length === 0) {
    throw new BadRequestError("Write a message or attach a file");
  }
  // Re-read from uploaded_files rather than trusting the request: this is what stops a
  // client attaching a storage path it merely guessed.
  const attachments = await media.resolveOwned(senderUserId, attachmentPaths);
  const row = await messagesRepo.insert({
    distribution_id: ctx.distribution_id,
    sender_id: senderUserId,
    body: body.trim(),
    attachments,
    reply_to_id: replyToId,
  });
  // Every message writes through here — student or business, top-level or reply — so
  // this is the one place that can keep the business's own row on 'in_conversation'.
  await markInConversation(recipientOf(ctx), ctx.enquiry_id);
  return toDto(
    row,
    senderUserId,
    ctx.student_id,
    await storage.resolvePreviewUrl(row.sender_photo_url),
    false,
    await media.withViewUrls(attachments),
  );
}

async function readThread(ctx: ThreadContext, viewerUserId: number): Promise<EnquiryMessageDto[]> {
  const rows = await messagesRepo.listByDistribution(ctx.distribution_id);
  // Signed once per sender, not per message: a thread is two or three people saying many
  // things, and each signature is a round trip to storage.
  const avatars = new Map<number, string | null>();
  for (const row of rows) {
    if (!avatars.has(row.sender_id)) {
      avatars.set(row.sender_id, await storage.resolvePreviewUrl(row.sender_photo_url));
    }
  }
  // Stars are per viewer, fetched for the whole thread at once rather than per row.
  const ids = rows.map((r) => r.id);
  const starred = new Set(await messagesRepo.listStarredIdsIn(ids, viewerUserId));
  // Both are one query for the whole thread, not one per message.
  const replyCounts = await messagesRepo.replyCountsIn(ctx.distribution_id);
  const reactions = groupReactions(await messagesRepo.listReactionsIn(ids), viewerUserId);
  return Promise.all(
    rows.map(async (row) =>
      toDto(
        row,
        viewerUserId,
        ctx.student_id,
        avatars.get(row.sender_id) ?? null,
        starred.has(row.id),
        await media.withViewUrls(row.attachments),
        replyCounts[row.id] ?? 0,
        reactions.get(row.id) ?? [],
      ),
    ),
  );
}

/**
 * Seeds the thread with UNLOCK_GREETING, on the unlock's own transaction so an unlocked
 * lead can never exist without its opener. Sent as the agent who unlocked, which is who
 * would have typed it — no synthetic system sender to special-case at render time.
 */
export async function seedOnUnlock(
  trx: Knex.Transaction,
  distributionId: string,
  senderUserId: number,
): Promise<void> {
  await messagesRepo.insertInTrx(trx, {
    distribution_id: distributionId,
    sender_id: senderUserId,
    body: UNLOCK_GREETING,
  });
}

// ── Student side ──

/**
 * The student's chat inbox: one entry per business that unlocked one of their enquiries.
 * A locked distribution has no thread, so it never appears here — the list IS the set of
 * conversations that exist.
 */
export async function listThreadsForStudent(studentId: number) {
  const rows = await messagesRepo.listThreadsForStudent(studentId);
  return Promise.all(
    rows.map(async (r) => ({
      distribution_id: r.distribution_id,
      enquiry_id: r.enquiry_id,
      business_name: r.business_name,
      // businesses.logo_url is a storage path, not a URL — same signing as enquiries.service.
      logo_url: await storage.resolvePreviewUrl(r.logo_url),
      course_name: r.course_name,
      is_closed: r.status === "closed",
      unlocked_at: new Date(r.unlocked_at).toISOString(),
      last_message_at: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
      last_message_body: r.last_message_body,
      // The lateral yields NULL for a thread with no messages, not false.
      last_message_is_mine: r.last_message_is_mine ?? false,
      unread_count: r.unread_count,
      is_favorite: r.favorited_at != null,
    })),
  );
}

/**
 * Moves the student's read cursor to now. Ownership is re-checked rather than trusted:
 * the distribution id comes straight off the URL.
 */
export async function markReadAsStudent(distributionId: string, userId: number): Promise<void> {
  const ctx = await assertStudentParticipant(distributionId, userId);
  assertUnlocked(ctx, "student");
  await messagesRepo.markThreadRead(distributionId, userId);
}

/** Pins/unpins the thread in the student's Favorites, returning the state it landed in. */
export async function toggleFavoriteAsStudent(distributionId: string, userId: number): Promise<boolean> {
  const ctx = await assertStudentParticipant(distributionId, userId);
  assertUnlocked(ctx, "student");
  return messagesRepo.toggleFavorite(distributionId, userId);
}

export interface StarredMessageDto extends EnquiryMessageDto {
  /** Which conversation the starred message came from — the Starred view badges it. */
  distribution_id: string;
  business_name: string;
  course_name: string;
}

/** Every message this student has starred, across all their threads, newest star first. */
export async function listStarredForStudent(userId: number): Promise<StarredMessageDto[]> {
  const rows = await messagesRepo.listStarredForStudent(userId);
  return Promise.all(
    rows.map(async (r) => ({
      // The student is both viewer and the thread's student here, so is_mine and
      // sender_role both fall out of comparing against their own id.
      ...toDto(
        r,
        userId,
        userId,
        await storage.resolvePreviewUrl(r.sender_photo_url),
        true,
        await media.withViewUrls(r.attachments),
      ),
      distribution_id: r.distribution_id,
      business_name: r.business_name,
      course_name: r.course_name,
    })),
  );
}

/**
 * Edits a message's body. Only the SENDER may edit their own, and only while the thread
 * is still open — an edit changes what the other side already read, so it is a write.
 */
export async function editAsStudent(
  messageId: number,
  userId: number,
  body: string,
): Promise<EnquiryMessageDto> {
  return editMessage(messageId, userId, body, asStudent(userId));
}

async function editMessage(
  messageId: number,
  userId: number,
  body: string,
  guard: Guard,
): Promise<EnquiryMessageDto> {
  const ctx = await loadOwnMessage(messageId, userId, guard);
  if (!body.trim()) throw new BadRequestError("A message can't be emptied — delete it instead");

  const row = await messagesRepo.updateBody(messageId, body.trim());
  return toDto(
    row,
    userId,
    ctx.student_id,
    await storage.resolvePreviewUrl(row.sender_photo_url),
    false,
    await media.withViewUrls(row.attachments),
  );
}

/**
 * Soft-deletes a message. Sender-only, same reasoning as editing. The row leaves every
 * read but stays on disk — see the migration for why an enquiry thread is not truly
 * erased.
 */
export async function deleteAsStudent(messageId: number, userId: number): Promise<void> {
  await loadOwnMessage(messageId, userId, asStudent(userId));
  await messagesRepo.softDelete(messageId);
}

/**
 * Resolves the message a reply should anchor to, and proves the caller is in its thread.
 *
 * Threads are ONE level deep, as in V2: replying to a reply anchors to that reply's own
 * parent (`reply_to_id || id`). Without this, a thread panel would need to recurse and a
 * reply could end up unreachable from the message it answers.
 */
async function resolveReplyParent(messageId: number, guard: Guard) {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await guard(message.distribution_id);
  return { ctx, parentId: message.reply_to_id ?? message.id };
}

/** The replies under one message, oldest first — the thread panel's list. */
export async function listRepliesForStudent(messageId: number, userId: number): Promise<EnquiryMessageDto[]> {
  return listReplies(messageId, userId, asStudent(userId), "student");
}

async function listReplies(
  messageId: number,
  userId: number,
  guard: Guard,
  side: SenderRole,
): Promise<EnquiryMessageDto[]> {
  const { ctx, parentId } = await resolveReplyParent(messageId, guard);
  assertUnlocked(ctx, side);

  const rows = await messagesRepo.listReplies(parentId);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const starred = new Set(await messagesRepo.listStarredIdsIn(ids, userId));
  const reactions = groupReactions(await messagesRepo.listReactionsIn(ids), userId);
  return Promise.all(
    rows.map(async (row) =>
      toDto(
        row,
        userId,
        ctx.student_id,
        await storage.resolvePreviewUrl(row.sender_photo_url),
        starred.has(row.id),
        await media.withViewUrls(row.attachments),
        // A reply cannot itself be replied to, so its own count is always zero.
        0,
        reactions.get(row.id) ?? [],
      ),
    ),
  );
}

/** Posts a reply into a message's thread. Same write gating as a top-level message. */
export async function sendReplyAsStudent(
  messageId: number,
  userId: number,
  body: string,
  attachmentPaths: string[] = [],
): Promise<EnquiryMessageDto> {
  return sendReply(messageId, userId, body, attachmentPaths, asStudent(userId), "student");
}

async function sendReply(
  messageId: number,
  userId: number,
  body: string,
  attachmentPaths: string[],
  guard: Guard,
  side: SenderRole,
): Promise<EnquiryMessageDto> {
  const { ctx, parentId } = await resolveReplyParent(messageId, guard);
  assertUnlocked(ctx, side);
  assertWritable(ctx);
  return appendMessage(ctx, userId, body, attachmentPaths, parentId);
}

/**
 * Toggles one emoji reaction, reporting whether it is now on. Reactions are per person
 * (unlike a pin) but visible to both sides (unlike a star) — the chip's count is how
 * many people used that emoji.
 */
export async function toggleReactionAsStudent(
  messageId: number,
  userId: number,
  emoji: string,
): Promise<boolean> {
  // Reacting writes to a thread both sides read, so a closed thread is read-only here too.
  assertWritable(await loadMessageThread(messageId, asStudent(userId)));
  return messagesRepo.toggleReaction(messageId, userId, emoji);
}

/**
 * Toggles the conversation pin. Same ownership gate as starring, but the effect is
 * shared: the business sees this pin too, which is how V2's pinned panel behaves.
 */
export async function togglePinAsStudent(messageId: number, userId: number): Promise<boolean> {
  // A closed thread is read-only, and pinning changes what both sides see.
  assertWritable(await loadMessageThread(messageId, asStudent(userId)));
  return messagesRepo.togglePin(messageId, userId);
}

/**
 * Toggles a star, but only on a message in a thread the student is part of — otherwise
 * the star table would be a way to probe which message ids exist.
 */
export async function toggleStarAsStudent(messageId: number, userId: number): Promise<boolean> {
  // No assertWritable: a star is a private bookmark, so it stays available on a closed
  // thread the same way reading it does.
  await loadMessageThread(messageId, asStudent(userId));
  return messagesRepo.toggleStar(messageId, userId);
}

export async function listForStudent(distributionId: string, userId: number): Promise<EnquiryMessageDto[]> {
  const ctx = await assertStudentParticipant(distributionId, userId);
  assertUnlocked(ctx, "student");
  return readThread(ctx, userId);
}

export async function sendAsStudent(
  distributionId: string,
  userId: number,
  body: string,
  attachmentPaths: string[] = [],
): Promise<EnquiryMessageDto> {
  const ctx = await assertStudentParticipant(distributionId, userId);
  assertUnlocked(ctx, "student");
  assertWritable(ctx);
  return appendMessage(ctx, userId, body, attachmentPaths);
}

// ── Business side ──
//
// The mirror of the student side. Every per-viewer table (thread state, stars, reactions)
// is keyed by platform_users.id, and an agent IS a platform_user, so none of this needed a
// migration: only the membership check differs, and that is what `asBusiness` supplies.
//
// Read state, favourites and stars are therefore PER AGENT, not per business — two agents
// working the same lead each keep their own cursor and bookmarks.

export async function listForBusiness(
  distributionId: string,
  recipient: Recipient,
  viewerUserId: number,
): Promise<EnquiryMessageDto[]> {
  const ctx = await assertBusinessParticipant(distributionId, recipient);
  assertUnlocked(ctx, "business");
  return readThread(ctx, viewerUserId);
}

export async function sendAsBusiness(
  distributionId: string,
  recipient: Recipient,
  userId: number,
  body: string,
  attachmentPaths: string[] = [],
): Promise<EnquiryMessageDto> {
  const ctx = await assertBusinessParticipant(distributionId, recipient);
  assertUnlocked(ctx, "business");
  assertWritable(ctx);
  return appendMessage(ctx, userId, body, attachmentPaths);
}

/** A thread in the business inbox. Counterpart is the student, not the business. */
export interface BusinessThreadSummaryDto {
  distribution_id: string;
  enquiry_id: string;
  student_name: string;
  student_avatar: string | null;
  course_name: string;
  is_closed: boolean;
  unlocked_at: string;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_is_mine: boolean;
  unread_count: number;
  is_favorite: boolean;
}

/**
 * This business's chat inbox: one entry per lead it has unlocked. A locked distribution
 * has no thread, so it never appears — the list IS the set of conversations that exist.
 */
export async function listThreadsForBusiness(
  recipient: Recipient,
  viewerUserId: number,
): Promise<BusinessThreadSummaryDto[]> {
  const rows = await messagesRepo.listThreadsForBusiness(recipient, viewerUserId);
  return Promise.all(
    rows.map(async (r) => ({
      distribution_id: r.distribution_id,
      enquiry_id: r.enquiry_id,
      student_name: r.student_name,
      // platform_users.photo_url is a storage path, not a URL — same signing as elsewhere.
      student_avatar: await storage.resolvePreviewUrl(r.student_photo_url),
      course_name: r.course_name,
      is_closed: r.status === "closed",
      unlocked_at: new Date(r.unlocked_at).toISOString(),
      last_message_at: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
      last_message_body: r.last_message_body,
      // The lateral yields NULL for a thread with no messages, not false.
      last_message_is_mine: r.last_message_is_mine ?? false,
      unread_count: r.unread_count,
      is_favorite: r.favorited_at != null,
    })),
  );
}

export async function markReadAsBusiness(
  distributionId: string,
  recipient: Recipient,
  userId: number,
): Promise<void> {
  const ctx = await assertBusinessParticipant(distributionId, recipient);
  assertUnlocked(ctx, "business");
  await messagesRepo.markThreadRead(distributionId, userId);
}

export async function toggleFavoriteAsBusiness(
  distributionId: string,
  recipient: Recipient,
  userId: number,
): Promise<boolean> {
  const ctx = await assertBusinessParticipant(distributionId, recipient);
  assertUnlocked(ctx, "business");
  return messagesRepo.toggleFavorite(distributionId, userId);
}

export interface BusinessStarredMessageDto extends EnquiryMessageDto {
  distribution_id: string;
  student_name: string;
  course_name: string;
}

/** Every message this agent starred, across the business's threads, newest star first. */
export async function listStarredForBusiness(
  recipient: Recipient,
  userId: number,
): Promise<BusinessStarredMessageDto[]> {
  const rows = await messagesRepo.listStarredForBusiness(recipient, userId);
  return Promise.all(
    rows.map(async (r) => ({
      // student_id comes from the row, not from the viewer: on this side the viewer is a
      // business agent, so sender_role has to be decided against the thread's student —
      // otherwise a teammate's message would read as the student's.
      ...toDto(
        r,
        userId,
        r.student_id,
        await storage.resolvePreviewUrl(r.sender_photo_url),
        true,
        await media.withViewUrls(r.attachments),
      ),
      distribution_id: r.distribution_id,
      student_name: r.student_name,
      course_name: r.course_name,
    })),
  );
}

export async function editAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
  body: string,
): Promise<EnquiryMessageDto> {
  return editMessage(messageId, userId, body, asBusiness(recipient));
}

export async function deleteAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
): Promise<void> {
  await loadOwnMessage(messageId, userId, asBusiness(recipient));
  await messagesRepo.softDelete(messageId);
}

export async function listRepliesForBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
): Promise<EnquiryMessageDto[]> {
  return listReplies(messageId, userId, asBusiness(recipient), "business");
}

export async function sendReplyAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
  body: string,
  attachmentPaths: string[] = [],
): Promise<EnquiryMessageDto> {
  return sendReply(messageId, userId, body, attachmentPaths, asBusiness(recipient), "business");
}

export async function toggleReactionAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
  emoji: string,
): Promise<boolean> {
  assertWritable(await loadMessageThread(messageId, asBusiness(recipient)));
  return messagesRepo.toggleReaction(messageId, userId, emoji);
}

export async function togglePinAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
): Promise<boolean> {
  assertWritable(await loadMessageThread(messageId, asBusiness(recipient)));
  return messagesRepo.togglePin(messageId, userId);
}

export async function toggleStarAsBusiness(
  messageId: number,
  recipient: Recipient,
  userId: number,
): Promise<boolean> {
  await loadMessageThread(messageId, asBusiness(recipient));
  return messagesRepo.toggleStar(messageId, userId);
}
