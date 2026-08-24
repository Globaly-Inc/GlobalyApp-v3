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
  business_id: number;
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

async function assertBusinessParticipant(distributionId: string, businessId: number): Promise<ThreadContext> {
  const ctx = await loadThread(distributionId);
  if (ctx.business_id !== businessId) throw new NotFoundError("Conversation not found");
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
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await assertStudentParticipant(message.distribution_id, userId);
  assertWritable(ctx);
  // Being in the thread is not enough — you may only edit what you wrote. 404 rather
  // than 403, matching how a non-participant is treated: no confirmation it exists.
  if (message.sender_id !== userId) throw new NotFoundError("Message not found");
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
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await assertStudentParticipant(message.distribution_id, userId);
  assertWritable(ctx);
  if (message.sender_id !== userId) throw new NotFoundError("Message not found");
  await messagesRepo.softDelete(messageId);
}

/**
 * Resolves the message a reply should anchor to, and proves the caller is in its thread.
 *
 * Threads are ONE level deep, as in V2: replying to a reply anchors to that reply's own
 * parent (`reply_to_id || id`). Without this, a thread panel would need to recurse and a
 * reply could end up unreachable from the message it answers.
 */
async function resolveReplyParent(messageId: number, userId: number) {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await assertStudentParticipant(message.distribution_id, userId);
  return { ctx, parentId: message.reply_to_id ?? message.id };
}

/** The replies under one message, oldest first — the thread panel's list. */
export async function listRepliesForStudent(messageId: number, userId: number): Promise<EnquiryMessageDto[]> {
  const { ctx, parentId } = await resolveReplyParent(messageId, userId);
  assertUnlocked(ctx, "student");

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
  const { ctx, parentId } = await resolveReplyParent(messageId, userId);
  assertUnlocked(ctx, "student");
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
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await assertStudentParticipant(message.distribution_id, userId);
  // Reacting writes to a thread both sides read, so a closed thread is read-only here too.
  assertWritable(ctx);
  return messagesRepo.toggleReaction(messageId, userId, emoji);
}

/**
 * Toggles the conversation pin. Same ownership gate as starring, but the effect is
 * shared: the business sees this pin too, which is how V2's pinned panel behaves.
 */
export async function togglePinAsStudent(messageId: number, userId: number): Promise<boolean> {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  const ctx = await assertStudentParticipant(message.distribution_id, userId);
  // A closed thread is read-only, and pinning changes what both sides see.
  assertWritable(ctx);
  return messagesRepo.togglePin(messageId, userId);
}

/**
 * Toggles a star, but only on a message in a thread the student is part of — otherwise
 * the star table would be a way to probe which message ids exist.
 */
export async function toggleStarAsStudent(messageId: number, userId: number): Promise<boolean> {
  const message = await messagesRepo.findById(messageId);
  if (!message) throw new NotFoundError("Message not found");
  await assertStudentParticipant(message.distribution_id, userId);
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

export async function listForBusiness(
  distributionId: string,
  businessId: number,
  viewerUserId: number,
): Promise<EnquiryMessageDto[]> {
  const ctx = await assertBusinessParticipant(distributionId, businessId);
  assertUnlocked(ctx, "business");
  return readThread(ctx, viewerUserId);
}

export async function sendAsBusiness(
  distributionId: string,
  businessId: number,
  userId: number,
  body: string,
): Promise<EnquiryMessageDto> {
  const ctx = await assertBusinessParticipant(distributionId, businessId);
  assertUnlocked(ctx, "business");
  assertWritable(ctx);
  return appendMessage(ctx, userId, body);
}
