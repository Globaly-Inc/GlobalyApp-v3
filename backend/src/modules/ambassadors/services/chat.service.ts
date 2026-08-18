// Prospect ↔ ambassador chat. Behavioural spec: V2 routes/ambassador-chat.ts.
//
// The participant set is derived server-side from the inquiry (prospect + the
// assigned ambassador's user), never from the request, and `sender_type` is
// derived the same way — a prospect cannot post as the ambassador by asking to.
//
// ponytail: REST only. V2 added an SSE tail on top of these same reads; V3
// already ships a general SSE thread stream in the messaging module, so a second
// one is duplication until an ambassador chat page actually exists. Add
// `GET /threads/:id/stream` modelled on messaging's when that page lands.

import { masterKnex } from "../../../core/db/master-pool.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/programs.repository.js";
import * as engagement from "../repositories/engagement.repository.js";

async function participantsOf(inquiry: engagement.InquiryRow): Promise<number[]> {
  const ids = [inquiry.prospect_id];
  if (inquiry.ambassador_id) {
    const ambassador = await repo.findAmbassadorById(inquiry.ambassador_id);
    if (ambassador) ids.push(ambassador.user_id);
  }
  return ids;
}

/** The inquiry, only if the caller is the prospect or the assigned ambassador. */
export async function getInquiryForParticipant(userId: number, inquiryId: number) {
  const inquiry = await engagement.findInquiry(inquiryId);
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  const participants = await participantsOf(inquiry);
  if (!participants.includes(userId)) {
    throw new ForbiddenError("Not a participant of this inquiry");
  }
  return { inquiry, participants };
}

export async function openThread(userId: number, inquiryId: number) {
  const { inquiry, participants } = await getInquiryForParticipant(userId, inquiryId);
  return engagement.ensureThread(inquiry.id, participants);
}

async function threadForParticipant(userId: number, threadId: number) {
  const thread = await engagement.findThread(threadId);
  if (!thread) throw new NotFoundError("Thread not found");
  if (!thread.participants.includes(userId)) {
    throw new ForbiddenError("Not a participant of this thread");
  }
  return thread;
}

export async function listMessages(userId: number, threadId: number) {
  const thread = await threadForParticipant(userId, threadId);
  return { data: await engagement.listMessages(thread.id) };
}

/**
 * Send a message. As in V1/V2, an `accepted` inquiry advances to `in_progress`
 * — but only when the sender is the ambassador; a prospect's reply does not
 * start the clock on work that has not begun.
 */
export async function sendMessage(userId: number, threadId: number, text: string) {
  const thread = await threadForParticipant(userId, threadId);

  return masterKnex.transaction(async (trx) => {
    const inquiry = await engagement.findInquiry(thread.inquiry_id, trx);
    if (!inquiry) throw new NotFoundError("Inquiry not found");
    const senderType = inquiry.prospect_id === userId ? "prospect" : "ambassador";

    const message = await engagement.insertMessage(
      { thread_id: thread.id, sender_id: userId, sender_type: senderType, message_text: text },
      trx,
    );

    if (inquiry.status === "accepted" && senderType === "ambassador") {
      await engagement.updateInquiry(inquiry.id, { status: "in_progress" }, trx);
    }
    return message;
  });
}
