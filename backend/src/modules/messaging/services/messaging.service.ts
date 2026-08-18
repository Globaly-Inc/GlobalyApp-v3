// Messaging orchestration. V1's `start-chat` and `invite-chat-participant` edge functions
// are the behavioural spec; V2's messages.ts is the route contract. No V1 rows migrate
// here (§3.5 "rebuild, no migration"), so nothing in this module carries a v1_id.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import * as conversationsRepo from "../repositories/conversations.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import type { SendMessageInput, StartConversationInput } from "../schemas/messaging.schema.js";

/**
 * The ownership boundary for every conversation-scoped route.
 *
 * A non-participant gets 404, not 403: whether a conversation exists is itself private,
 * and the same answer for "no such row" and "not yours" leaks nothing.
 */
export async function requireParticipant(conversationId: number, platformUserId: number) {
  const participant = await conversationsRepo.findActiveParticipant(conversationId, platformUserId);
  if (!participant) throw new NotFoundError("Conversation not found");
  return participant;
}

export async function listConversations(platformUserId: number, pagination: PaginationInput) {
  const page = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    conversationsRepo.listForUser(platformUserId, page),
    conversationsRepo.countForUser(platformUserId),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function getConversation(
  conversationId: number,
  platformUserId: number,
  query: PaginationInput & { anchor_id?: number },
) {
  await requireParticipant(conversationId, platformUserId);

  const conversation = await conversationsRepo.findById(conversationId);
  if (!conversation) throw new NotFoundError("Conversation not found");

  // Absent anchor = first page: pin it to the newest message now, and hand it back so
  // every later page of this scroll reads the same frozen window.
  const anchorId = query.anchor_id ?? (await messagesRepo.maxId(conversationId));
  const page = paginationToOffset(query);
  const [participants, messages, total] = await Promise.all([
    conversationsRepo.listParticipants(conversationId),
    messagesRepo.history(conversationId, anchorId, page),
    messagesRepo.countHistory(conversationId, anchorId),
  ]);

  const paged = buildPaginatedResponse(messages, total, query);
  return {
    conversation,
    participants,
    messages: { ...paged, meta: { ...paged.meta, anchor_id: anchorId } },
  };
}

/**
 * Start a conversation from the business side — the shape V1's start-chat had.
 *
 * Idempotent per enquiry: V1 returned the existing conversation rather than opening a
 * second thread on the same enquiry, and a partial unique index enforces that under
 * concurrency too.
 * ponytail: students cannot open a thread, exactly as in V1 (a chat begins when a business
 * unlocks an enquiry). Add a student-initiated path here if the product ever wants one.
 */
export async function startConversation(
  input: StartConversationInput,
  ctx: { platformUserId: number; business: BusinessRecord; tenantDb: Knex },
): Promise<{ conversation_id: number; existing: boolean }> {
  if (input.enquiry_id) {
    const existing = await conversationsRepo.findByEnquiry(input.enquiry_id);
    if (existing) return { conversation_id: existing.id, existing: true };
  }

  if (input.student_user_id === ctx.platformUserId) {
    throw new BadRequestError("A conversation needs two different people");
  }

  const student = await masterKnex("platform_users")
    .where({ id: input.student_user_id })
    .whereNull("deleted_at")
    .first();
  if (!student) throw new NotFoundError("Student not found");

  const agent = await ctx.tenantDb("agents")
    .where({ platform_user_id: ctx.platformUserId })
    .whereNull("deleted_at")
    .first();
  if (!agent) throw new ForbiddenError("Not a member of this business");

  // V1 also matched one hardcoded category UUID; business_type is the portable half of
  // that rule and the only half V3 can honour.
  const role: conversationsRepo.ParticipantRole =
    ctx.business.business_type === "institution" ? "provider_member" : "agent_member";

  const conversationId = await masterKnex.transaction(async (trx) => {
    const conversation = await conversationsRepo.createConversation(
      {
        enquiry_id: input.enquiry_id ?? null,
        title: input.title ?? `Enquiry Chat - ${ctx.business.business_name}`,
        created_by: ctx.platformUserId,
      },
      trx,
    );
    await conversationsRepo.addParticipants(
      [
        {
          conversation_id: conversation.id,
          platform_user_id: ctx.platformUserId,
          role,
          business_id: Number(ctx.business.id),
        },
        {
          conversation_id: conversation.id,
          platform_user_id: input.student_user_id,
          role: "student",
          business_id: null,
        },
      ],
      trx,
    );
    // V1 opened every thread with this system message; the student's inbox would
    // otherwise show an empty conversation.
    await messagesRepo.insert(
      { conversation_id: conversation.id, sender_id: ctx.platformUserId, content: "Conversation started" },
      trx,
    );
    return conversation.id;
  });

  return { conversation_id: conversationId, existing: false };
}

export async function sendMessage(conversationId: number, platformUserId: number, input: SendMessageInput) {
  const conversation = await conversationsRepo.findById(conversationId);
  await requireParticipant(conversationId, platformUserId);
  if (conversation?.status === "closed") throw new ConflictError("This conversation is closed");

  const id = await masterKnex.transaction(async (trx) => {
    const row = await messagesRepo.insert(
      {
        conversation_id: conversationId,
        sender_id: platformUserId,
        content: input.content ?? null,
        message_type: input.message_type,
        file_url: input.file_url ?? null,
        file_name: input.file_name ?? null,
        file_size: input.file_size ?? null,
      },
      trx,
    );
    // Keeps the conversation list sortable without it ever touching the message table.
    await conversationsRepo.touch(conversationId, trx);
    return row.id;
  });

  return messagesRepo.findHydrated(id);
}

/**
 * Invite a team member into an existing thread — a faithful port of V1's
 * invite-chat-participant: active participant, never a student, invitee must be an
 * accepted member of the caller's own business, and a participant who left is
 * re-activated rather than duplicated.
 * ponytail: V1 also wrote a notification row; notifications are D3's table and do not
 * exist yet — add the insert here once they do.
 */
export async function inviteParticipant(
  conversationId: number,
  inviteeUserId: number,
  ctx: { platformUserId: number; business: BusinessRecord; tenantDb: Knex },
) {
  const caller = await requireParticipant(conversationId, ctx.platformUserId);
  if (caller.role === "student") throw new ForbiddenError("Students cannot invite participants");
  if (caller.business_id !== Number(ctx.business.id)) {
    throw new ForbiddenError("Switch to the business that owns this conversation");
  }

  const member = await ctx.tenantDb("agents")
    .where({ platform_user_id: inviteeUserId })
    .whereNull("deleted_at")
    .first();
  if (!member) throw new BadRequestError("Invitee is not a team member of your business");

  const existing = await conversationsRepo.findParticipant(conversationId, inviteeUserId);
  if (existing?.is_active) throw new ConflictError("User is already a participant");
  if (existing) return conversationsRepo.reactivateParticipant(existing.id);

  const [participant] = await conversationsRepo.addParticipants([
    {
      conversation_id: conversationId,
      platform_user_id: inviteeUserId,
      role: caller.role as conversationsRepo.ParticipantRole,
      business_id: caller.business_id,
    },
  ]);
  return participant;
}

/** Moves the caller's watermark to the newest message. Idempotent. */
export async function markRead(conversationId: number, platformUserId: number) {
  await requireParticipant(conversationId, platformUserId);
  const newest = await messagesRepo.maxId(conversationId);
  if (newest > 0) await conversationsRepo.markRead(conversationId, platformUserId, newest);
  return {
    last_read_message_id: newest || null,
    unread_count: await conversationsRepo.countUnread(conversationId, platformUserId),
  };
}
