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
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as messagesRepo from "../repositories/messages.repository.js";

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
): Promise<EnquiryMessageDto> {
  const row = await messagesRepo.insert({
    distribution_id: ctx.distribution_id,
    sender_id: senderUserId,
    body: body.trim(),
  });
  return toDto(row, senderUserId, ctx.student_id, await storage.resolvePreviewUrl(row.sender_photo_url));
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
  return rows.map((row) => toDto(row, viewerUserId, ctx.student_id, avatars.get(row.sender_id) ?? null));
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
    })),
  );
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
): Promise<EnquiryMessageDto> {
  const ctx = await assertStudentParticipant(distributionId, userId);
  assertUnlocked(ctx, "student");
  assertWritable(ctx);
  return appendMessage(ctx, userId, body);
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
