// Conversation signals — the shape of one journey, and the aggregates read back from many.
// zod first, types by z.infer, as everywhere else in this module.

import { z } from "zod";
import { TOPICS } from "../lib/conversation-topics.js";

const Topic = z.enum(TOPICS);

/**
 * One finished conversation.
 *
 * Note what the schema does NOT admit: no content, no name, no email, no visitor attributes.
 * The topic fields are a closed vocabulary, so nothing a visitor typed can reach this row even
 * by accident — the type system is the first enforcement of the table's privacy contract, and
 * the CHECK constraints in the migration are the second.
 */
export const ConversationSignalsSchema = z.object({
  session_id: z.number().int().positive(),
  visitor_key: z.string().min(1),
  embed_config_id: z.number().int().positive(),

  first_topic: Topic.nullable(),
  topic_sequence: z.array(Topic).max(40),
  message_count: z.number().int().min(0),
  duration_seconds: z.number().int().min(0).nullable(),

  converted: z.boolean(),
  contact_source: z.enum(["card", "volunteered"]).nullable(),
  /** Whether the counsellor ever asked. The difference between a lead and a volunteered one. */
  ai_prompted: z.boolean(),
  messages_to_conversion: z.number().int().min(0).nullable(),
  topic_before_conversion: Topic.nullable(),
  converted_at: z.date().nullable(),

  memory_ids: z.array(z.string()).max(50),
});
export type ConversationSignals = z.infer<typeof ConversationSignalsSchema>;

export interface ConversionInsights {
  conversations: number;
  converted: number;
  /** Converted without ever being asked — the "easy conversion" of §11. */
  volunteered: number;
  /** Converted having been asked at least once. */
  prompted: number;
  median_messages_to_conversion: number | null;
  /** §10's "time from first interaction to conversion", in seconds. */
  median_seconds_to_conversion: number | null;
  top_paths: Array<{ path: string[]; count: number }>;
  topic_before_conversion: Array<{ value: string; count: number }>;
  first_topic: Array<{ value: string; count: number }>;
}
