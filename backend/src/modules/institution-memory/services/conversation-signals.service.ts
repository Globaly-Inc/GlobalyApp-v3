// Turning a finished conversation into one row of journey.
//
// This answers §10 of the Knowledge Rack analysis — "not email_captured = true, but the journey
// that led to it" — and it is deliberately the cheapest thing that can: no model call, no event
// stream, no second worker. The conversation job already fires at conversation end and already
// resolves the institution; this rides it.
//
// Two facts worth knowing before reading the code:
//
//   1. `ai_prompted` and `messages_to_conversion` were ALREADY derivable and simply never read.
//      ai_widget_visitors.contact_prompt_count records whether the counsellor ever asked, and
//      message_count records where the visitor had got to. The analysis flagged that; this is
//      the thing that finally reads them.
//   2. Nothing here stores content. Topics come from a fixed vocabulary (lib/conversation-topics)
//      and the only free text that touches this function is matched against regexes and
//      discarded.

import { createChildLogger } from "../../../shared/logger.js";
import { tenantDbFor } from "../../ai-counsellor/services/visitor.service.js";
import type { EmbedConfigRow } from "../../ai-counsellor/repositories/embed.repository.js";
import * as learnRepo from "../repositories/learning.repository.js";
import * as signalsRepo from "../repositories/signals.repository.js";
import { topicOf, topicSequence, type Topic } from "../lib/conversation-topics.js";
import { ConversationSignalsSchema } from "../schemas/signals.schema.js";

const logger = createChildLogger("conversation-signals");

/**
 * The visitor's last question BEFORE they handed over their details.
 *
 * `messages_to_conversion` is the visitor's own message count at submission, so the turn that
 * preceded the hand-over is the one at that index — this is the §11 question ("what were they
 * asking about when they converted?") and it is answerable from the transcript alone.
 */
function topicBeforeConversion(
  turns: ReadonlyArray<{ role: string; content: string }>,
  messagesToConversion: number | null,
): Topic | null {
  if (!messagesToConversion) return null;
  const visitorTurns = turns.filter((t) => t.role === "user");
  const turn = visitorTurns[Math.min(messagesToConversion, visitorTurns.length) - 1];
  return turn ? topicOf(turn.content) : null;
}

/**
 * Record the journey for one finished conversation.
 *
 * Never throws: this runs beside learning on a job whose failure must cost an insight, never a
 * reply that has already been sent.
 */
export async function recordConversationSignals(opts: {
  institutionId: number;
  session: learnRepo.LearnSession;
  config: EmbedConfigRow;
}): Promise<void> {
  const { institutionId, session, config } = opts;
  if (!session.visitor_key || !session.embed_config_id) return; // a platform chat, not a widget one

  try {
    const turns = await learnRepo.findTranscript(session.id);
    if (!turns.length) return;

    // The visitor row holds the conversion facts. Best-effort: a tenant schema that cannot be
    // reached costs the conversion half of the journey, not the journey.
    const db = await tenantDbFor(config).catch(() => null);
    const visitor = db
      ? await db("ai_widget_visitors")
          .select("email", "contact_source", "contact_prompt_count", "contact_submitted_at",
                  "message_count", "first_seen_at", "last_activity_at")
          .where({ visitor_key: session.visitor_key, embed_config_id: session.embed_config_id })
          .first()
          .catch(() => null)
      : null;

    const sequence = topicSequence(turns);
    const converted = !!visitor?.email;
    // Their message count at submission. The row's current count is where they finished, which
    // for a visitor who kept talking afterwards is not the same number.
    const messagesToConversion = converted ? Number(visitor?.message_count ?? 0) || null : null;
    // Both timestamps come from the visitor row rather than the transcript: the shared
    // MESSAGE_COLUMNS query carries no created_at, and widening it for one derived number would
    // change what the learning path reads too.
    const first = visitor?.first_seen_at ? new Date(visitor.first_seen_at).getTime() : null;
    const last = visitor?.last_activity_at ? new Date(visitor.last_activity_at).getTime() : null;

    const signals = ConversationSignalsSchema.parse({
      session_id: session.id,
      visitor_key: session.visitor_key,
      embed_config_id: session.embed_config_id,
      first_topic: sequence[0] ?? null,
      topic_sequence: sequence.slice(0, 40),
      message_count: turns.filter((t) => t.role === "user").length,
      duration_seconds: first && last && last > first ? Math.round((last - first) / 1000) : null,
      converted,
      contact_source: visitor?.contact_source ?? null,
      // The §11 distinction: did they volunteer, or did we ask? Already recorded, never read.
      ai_prompted: Number(visitor?.contact_prompt_count ?? 0) > 0,
      messages_to_conversion: messagesToConversion,
      topic_before_conversion: topicBeforeConversion(turns, messagesToConversion),
      converted_at: visitor?.contact_submitted_at ? new Date(visitor.contact_submitted_at) : null,
      // Which guidance shaped this conversation — ties a journey back to the memories behind it.
      memory_ids: [...new Set(turns.flatMap((t) => t.memory_ids ?? []))].slice(0, 50),
    });

    await signalsRepo.record(institutionId, signals);
    logger.info("Journey recorded", {
      institutionId, sessionId: session.id, converted, path: signals.topic_sequence.join(">"),
    });
  } catch (err) {
    logger.warn("Conversation signals not recorded", { institutionId, sessionId: session.id, err: String(err) });
  }
}
