// The three human signals that feed institution-memory's learning queue, published from the
// counsellor's own routes: a student's thumbs, a counsellor's review, a finished widget chat.
//
// Each one writes its column first and enqueues second, because the worker reads the row, not
// the job. A dead broker costs a learning opportunity, never the write.
//
// Ownership is checked here, not in the routes: the feedback PATCH used to accept any message
// id from any signed-in user.

import * as sessionsRepo from "../repositories/sessions.repository.js";
import type { EmbedConfigRow } from "../repositories/embed.repository.js";
import * as learnRepo from "../../institution-memory/repositories/learning.repository.js";
import { enqueueLearning, hashActor, type ReviewMessageInput } from "../../institution-memory/index.js";
import { NotFoundError } from "../../../shared/errors.js";

/** Who is thumbing: the signed-in student, or a widget visitor on one specific widget. */
export type FeedbackActor = { userId: number } | { visitorKey: string; embedConfigId: number };

// Same prefixes as learning.service's actorOf, so a vote and a reinforcement from the same
// person hash to the same actor.
const actorHash = (a: FeedbackActor) => "userId" in a ? hashActor(`u:${a.userId}`) : hashActor(`v:${a.visitorKey}`);

async function ownedMessage(messageId: number) {
  const message = await learnRepo.findMessage(messageId);
  const session = message && await learnRepo.findSession(message.session_id);
  if (!message || !session) throw new NotFoundError("Message not found");
  return { message, session };
}

export async function recordStudentFeedback(messageId: number, feedback: "positive" | "negative" | null, actor: FeedbackActor): Promise<void> {
  const { message, session } = await ownedMessage(messageId);
  const owns = "userId" in actor
    ? session.platform_user_id === actor.userId
    : session.visitor_key === actor.visitorKey && session.embed_config_id === actor.embedConfigId;
  // Not-found rather than forbidden: a message id that is not yours should not confirm it exists.
  if (!owns) throw new NotFoundError("Message not found");

  await learnRepo.recordFeedback(messageId, feedback, actorHash(actor));

  if (!feedback || !message.memory_ids.length) return;
  const owner = await learnRepo.institutionForSession(session);
  if (owner) await enqueueLearning({ kind: "feedback", institution_id: owner.institutionId, message_id: messageId });
}

/** A member of the widget's institution reviewed one of its counsellor's replies. */
export async function recordCounsellorReview(messageId: number, review: ReviewMessageInput, reviewer: { userId: number; institutionId: number }): Promise<void> {
  const { message, session } = await ownedMessage(messageId);
  const owner = await learnRepo.institutionForSession(session);
  if (message.role !== "assistant" || owner?.institutionId !== reviewer.institutionId) throw new NotFoundError("Message not found");

  await learnRepo.recordReview(messageId, review, reviewer.userId);

  // corrected → the worker stores the correction and derives rules; approved / flagged →
  // it reinforces or votes against the memories the reply used. Nothing used → nothing to learn.
  if (review.status === "corrected" || message.memory_ids.length) {
    await enqueueLearning({ kind: "correction", institution_id: owner.institutionId, message_id: messageId });
  }
}

/**
 * A widget visitor ended their chat.
 *
 * Published UNCONDITIONALLY, because two different things ride this one job and they are gated
 * differently: conversion signals are the institution's own funnel analytics and always run,
 * while learning writes guidance the counsellor will follow and stays behind the opt-in. Both
 * gates live in the worker now (learning.service.learnFromConversation), which is the only place
 * that can tell them apart.
 */
export async function onConversationEnd(config: EmbedConfigRow, visitorKey: string): Promise<void> {
  // A business widget returns here and is never learned from, and never has its journey
  // recorded. Same deliberate institution-only scope as buildEmbedContext's rackInstitutionId —
  // see the note there. Revisit both together if business parity is ever taken on.
  if (config.institution_id == null) return;
  // Published unconditionally since conversion signals ride this job. The auto_learn check moved
  // INTO the worker (learnFromConversation), because the two halves are gated differently: an
  // institution's own funnel analytics should not depend on whether it opted its counsellor into
  // learning. The worker records the journey either way and learns only when permitted.
  const session = await sessionsRepo.findByVisitor(visitorKey, config.id);
  if (session) await enqueueLearning({ kind: "conversation", institution_id: Number(config.institution_id), session_id: session.id });
}
