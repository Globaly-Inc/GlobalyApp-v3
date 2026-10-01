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
import { enqueueLearning, getProfile, hashActor, type ReviewMessageInput } from "../../institution-memory/index.js";
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
 * A widget visitor ended their chat. Learns only where the institution opted in.
 *
 * Two sources of that opt-in, and either is enough. `ai_embed_configs.auto_learn` is per widget
 * and predates the Rack; `institution_ai_profile.learning.auto_learn` is per institution and is
 * what the portal actually exposes. Reading only the column — which is what this did until the
 * Rack's toggle was wired — meant switching learning on in the portal changed nothing at all.
 *
 * OR rather than a precedence rule: the column is the older, narrower switch, so a widget that
 * already has it on keeps working, and the institution-wide toggle turns it on for the rest.
 * Turning it off in the portal does not force off a widget whose column was set deliberately.
 */
export async function onConversationEnd(config: EmbedConfigRow, visitorKey: string): Promise<void> {
  if (config.institution_id == null) return;
  const rack = await getProfile(Number(config.institution_id)).catch(() => null);
  if (!config.auto_learn && !rack?.profile.learning.auto_learn) return;
  const session = await sessionsRepo.findByVisitor(visitorKey, config.id);
  if (session) await enqueueLearning({ kind: "conversation", institution_id: Number(config.institution_id), session_id: session.id });
}
