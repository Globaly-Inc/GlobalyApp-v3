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
import * as memoryRepo from "../repositories/memory.repository.js";
import { enqueueLearning } from "./learning.service.js";
import { topicOf, topicSequence, type Topic } from "../lib/conversation-topics.js";
import { ConversationSignalsSchema } from "../schemas/signals.schema.js";

const logger = createChildLogger("conversation-signals");

/**
 * When the journey ENDED, for duration purposes.
 *
 * Exported and pure because this is the third figure in this file derived from a column that
 * keeps moving after the moment it is meant to describe — `message_count` was the first, and the
 * comment above it named the hazard while the code did it anyway. A converted journey ends when
 * they handed over their details; `last_activity_at` advances on every later turn, so using it
 * would report the whole conversation as "time to conversion".
 *
 * An unconverted journey genuinely ends at the last thing they did, so that is what it uses.
 */
export function journeyEndedAt(visitor: {
  contact_submitted_at?: Date | string | null;
  last_activity_at?: Date | string | null;
} | null, converted: boolean): number | null {
  const at = converted && visitor?.contact_submitted_at ? visitor.contact_submitted_at : visitor?.last_activity_at;
  return at ? new Date(at).getTime() : null;
}

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
                  "contact_submitted_at_count", "message_count", "first_seen_at", "last_activity_at")
          .where({ visitor_key: session.visitor_key, embed_config_id: session.embed_config_id })
          .first()
          .catch(() => null)
      : null;

    const sequence = topicSequence(turns);
    const converted = !!visitor?.email;
    // Their count AT SUBMISSION, recorded by the contact writers — not message_count, which is
    // where they finished. This comment used to say exactly that and the line below read
    // message_count anyway, so a visitor who kept chatting had every later message counted as
    // effort spent winning the lead, and topic_before_conversion could land on a question asked
    // after they had already shared their details.
    //
    // Null rather than a fallback when the column is empty (a row that converted before
    // 20261001_004): an unknown figure is honest, a wrong one quietly skews the median.
    const messagesToConversion = converted ? Number(visitor?.contact_submitted_at_count ?? 0) || null : null;
    // Both timestamps come from the visitor row rather than the transcript: the shared
    // MESSAGE_COLUMNS query carries no created_at, and widening it for one derived number would
    // change what the learning path reads too.
    const first = visitor?.first_seen_at ? new Date(visitor.first_seen_at).getTime() : null;
    const last = journeyEndedAt(visitor, converted);

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

/** How long a conversation-end job is presumed still in flight before the sweep replays it. */
const SIGNALS_RECOVERY_GRACE_MIN = Number(process.env.LEARN_RECOVERY_GRACE_MIN) || 15;
/** One sweep's worth; a backlog drains over successive hourly runs rather than in one burst. */
const SIGNALS_RECOVERY_BATCH = 200;

/**
 * Replay journeys whose conversation-end job never produced a signals row.
 *
 * The learning side has had a recovery sweep since the broker outage that motivated it, keyed on
 * `*_learned_at` columns. The conversation job carries a SESSION rather than a message, so it had
 * no marker and no replay — documented at the time as a known gap, and acceptable while the only
 * cost was a missed learning opportunity. It stopped being acceptable when conversion insights
 * started riding the same job: a dropped publish now permanently understates the funnel, and an
 * undercount nobody can see is worse than a gap someone can.
 *
 * No new marker column is needed. Both tables are in the SAME tenant schema, so "ended, with no
 * journey recorded" is a left join — and `record()` upserts on session_id, so replaying one that
 * did land is harmless.
 */
export async function sweepMissingSignals(): Promise<{ found: number; requeued: number }> {
  const cutoff = new Date(Date.now() - SIGNALS_RECOVERY_GRACE_MIN * 60_000);
  let found = 0;
  let requeued = 0;

  for (const institutionId of await memoryRepo.provisionedInstitutionIds()) {
    try {
      const rows = await signalsRepo.endedWithoutSignals(institutionId, cutoff, SIGNALS_RECOVERY_BATCH);
      found += rows.length;
      for (const row of rows) {
        if (await enqueueLearning({ kind: "conversation", institution_id: institutionId, session_id: row.session_id })) {
          requeued++;
        }
      }
    } catch (err) {
      // An un-migrated tenant schema is the usual cause; the others still get swept.
      logger.warn("Signals recovery failed for institution", { institutionId, err: String(err) });
    }
  }
  if (found) logger.info("Conversation signals recovery", { found, requeued });
  return { found, requeued };
}
