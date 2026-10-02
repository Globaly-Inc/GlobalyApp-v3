// institution_conversation_signals — one row per finished conversation, in the institution's
// own schema. Same tenant resolution as every other Rack table.

import { createChildLogger } from "../../../shared/logger.js";
import * as memoryRepo from "./memory.repository.js";
import { transitionGuidance } from "../lib/conversation-topics.js";
import type { ConversationSignals, ConversionInsights, TopicTransition } from "../schemas/signals.schema.js";

const logger = createChildLogger("institution-signals-repo");
const TABLE = "institution_conversation_signals";

/**
 * Conversations a step must appear in before it is shown at all.
 *
 * The gap analysis deferred pattern mining precisely because "a pattern mined from twenty
 * conversations is noise", and a floor is the cheap half of that: two visitors who both happened
 * to mention fees then visas is a coincidence an institution should not be invited to teach its
 * counsellor. The panel shows the corpus size beside the list so the reader can judge the rest.
 */
const MIN_TRANSITION_SUPPORT = 3;
const TRANSITION_LIMIT = 12;

/**
 * Record one journey.
 *
 * ON CONFLICT (session_id) DO UPDATE, not DO NOTHING: the queue is at-least-once and the hourly
 * recovery sweep can replay a conversation job, so a redelivery must refresh the row rather than
 * leave a half-finished journey from the first attempt. The conversation is over by then, so the
 * later read is the more complete one.
 */
export async function record(institutionId: number, s: ConversationSignals): Promise<void> {
  const k = await memoryRepo.tenantDbOrNull(institutionId);
  if (!k) return; // no provisioned schema — nothing to record into, and not an error
  const row = {
    session_id: s.session_id,
    visitor_key: s.visitor_key,
    embed_config_id: s.embed_config_id,
    first_topic: s.first_topic,
    topic_sequence: JSON.stringify(s.topic_sequence),
    message_count: s.message_count,
    duration_seconds: s.duration_seconds,
    converted: s.converted,
    contact_source: s.contact_source,
    ai_prompted: s.ai_prompted,
    messages_to_conversion: s.messages_to_conversion,
    topic_before_conversion: s.topic_before_conversion,
    converted_at: s.converted_at,
    memory_ids: JSON.stringify(s.memory_ids),
  };
  await k(TABLE).insert(row).onConflict("session_id").merge(row);
}

/**
 * The §11 answers, as aggregates rather than a corpus scan.
 *
 * Every figure here is a count over journeys. Nothing returns a transcript, a visitor key or a
 * message — the table holds none of those, and the point of this endpoint is the shape of the
 * funnel, not the people in it.
 */
export async function insights(institutionId: number): Promise<ConversionInsights> {
  const k = await memoryRepo.tenantDbOrNull(institutionId);
  const empty: ConversionInsights = {
    conversations: 0, converted: 0, volunteered: 0, prompted: 0,
    median_messages_to_conversion: null, median_seconds_to_conversion: null,
    top_paths: [], topic_before_conversion: [], first_topic: [], transitions: [],
  };
  if (!k) return empty;

  try {
    const totals = await k(TABLE)
      .count<{ conversations: string; converted: string; volunteered: string; prompted: string }[]>({
        conversations: "*",
      })
      .select(
        k.raw("count(*) FILTER (WHERE converted) AS converted"),
        // ONE axis — `ai_prompted` — so the two groups PARTITION the converted set and sum to it.
        //
        // `volunteered` used to key on contact_source = 'volunteered', which answers a different
        // question: how the value arrived, not whether we had to ask. A visitor shown the card
        // who then types their address into the chat instead carries BOTH markers, so that lead
        // was counted in both groups and the panel's "two slices of the same N leads" was false.
        //
        // §11 asks whether a lead came easily, and "were they ever asked" is that question.
        // contact_source stays on the row and in the visitor drawer, where "card or conversation"
        // is the thing someone actually wants to know.
        k.raw("count(*) FILTER (WHERE converted AND NOT ai_prompted) AS volunteered"),
        k.raw("count(*) FILTER (WHERE converted AND ai_prompted) AS prompted"),
      )
      .first();

    // Median rather than mean: one 60-message outlier would otherwise move the number a reader
    // is using to decide when the counsellor should offer to follow up.
    // Both medians in one pass. Median rather than mean throughout: one 60-message outlier would
    // otherwise move a number someone is using to decide when the counsellor should offer to
    // follow up.
    const median = await k(TABLE)
      .where({ converted: true })
      .select(
        k.raw("percentile_cont(0.5) WITHIN GROUP (ORDER BY messages_to_conversion) FILTER (WHERE messages_to_conversion IS NOT NULL) AS messages"),
        k.raw("percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS seconds"),
      )
      .first<{ messages: string | null; seconds: string | null } | undefined>();

    const group = async (column: string, where?: Record<string, unknown>) => {
      const q = k(TABLE).whereNotNull(column).groupBy(column).select(column)
        .count<{ value: string; count: string }[]>({ count: "*" })
        .orderBy("count", "desc").limit(10);
      if (where) q.where(where);
      return (await q).map((r) => ({ value: String((r as Record<string, unknown>)[column]), count: Number(r.count) }));
    };

    const paths = await k(TABLE)
      .where({ converted: true })
      .groupBy("topic_sequence")
      .select("topic_sequence")
      .count<{ topic_sequence: unknown; count: string }[]>({ count: "*" })
      .orderBy("count", "desc")
      .limit(5);

    // ── Phase 5: topic transitions ──
    // Adjacent pairs across every journey, counted by CONVERSATION. One pass: the sequence is
    // unnested WITH ORDINALITY so position i joins position i+1 inside the same row, which is a
    // GROUP BY rather than the corpus scan a mining pipeline would have been.
    const transitionRows = await k
      .raw<{ rows: Array<{ from_topic: string; to_topic: string; support: string; converted: string }> }>(
        `WITH steps AS (
           SELECT s.id, s.converted, t.topic, t.i
             FROM ?? s,
                  LATERAL jsonb_array_elements_text(s.topic_sequence) WITH ORDINALITY AS t(topic, i)
         )
         SELECT a.topic AS from_topic,
                b.topic AS to_topic,
                count(DISTINCT a.id) AS support,
                count(DISTINCT a.id) FILTER (WHERE a.converted) AS converted
           FROM steps a
           JOIN steps b ON b.id = a.id AND b.i = a.i + 1
          GROUP BY 1, 2
         HAVING count(DISTINCT a.id) >= ?
          ORDER BY support DESC, converted DESC
          LIMIT ?`,
        [TABLE, MIN_TRANSITION_SUPPORT, TRANSITION_LIMIT],
      );

    return {
      conversations: Number(totals?.conversations ?? 0),
      converted: Number(totals?.converted ?? 0),
      volunteered: Number(totals?.volunteered ?? 0),
      prompted: Number(totals?.prompted ?? 0),
      median_messages_to_conversion: median?.messages == null ? null : Number(median.messages),
      median_seconds_to_conversion: median?.seconds == null ? null : Math.round(Number(median.seconds)),
      top_paths: paths.map((p) => ({
        path: Array.isArray(p.topic_sequence) ? (p.topic_sequence as string[]) : [],
        count: Number(p.count),
      })),
      topic_before_conversion: await group("topic_before_conversion", { converted: true }),
      first_topic: await group("first_topic"),
      transitions: (transitionRows.rows ?? []).map((r): TopicTransition => ({
        from: r.from_topic,
        to: r.to_topic,
        support: Number(r.support),
        converted: Number(r.converted),
        suggestion: transitionGuidance(r.from_topic, r.to_topic),
      })),
    };
  } catch (err) {
    // An un-migrated tenant schema is the usual cause. An empty panel, never a failed page.
    logger.warn("Conversion insights read failed", { institutionId, err: String(err) });
    return empty;
  }
}

/**
 * Conversations that ended but produced no journey — the recovery sweep's input.
 *
 * A left join inside ONE tenant schema: ai_widget_visitors and institution_conversation_signals
 * both live here, so no marker column and no cross-schema lookup is needed. `end_confirmed_at`
 * is the only honest "this conversation is over" signal on the row — it is set by the visitor
 * pressing end, which is the same event that publishes the job this recovers.
 */
export async function endedWithoutSignals(
  institutionId: number,
  endedBefore: Date,
  limit: number,
): Promise<Array<{ session_id: number }>> {
  const k = await memoryRepo.tenantDbOrNull(institutionId);
  if (!k) return [];
  return k("ai_widget_visitors as v")
    .leftJoin(`${TABLE} as s`, "s.session_id", "v.session_id")
    .whereNotNull("v.session_id")
    .whereNotNull("v.end_confirmed_at")
    .where("v.end_confirmed_at", "<", endedBefore)
    .whereNull("s.id")
    .orderBy("v.end_confirmed_at", "asc")
    .limit(limit)
    .select<Array<{ session_id: number }>>("v.session_id");
}
