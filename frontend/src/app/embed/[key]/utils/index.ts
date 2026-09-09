import type { CourseCard, Message } from "@/app/ai/apis/types";
import type { EmbedStoredMessage } from "../apis/types";

/**
 * A stored turn from `/guest/session` in the shape the shared chat renderer wants.
 *
 * Real ids are kept (they're rows in `ai_counselor_messages` now, not the widget's old
 * throwaway negatives), so a restored message can carry feedback later without a second
 * mapping. Cards come back in the backend's prompt format and are converted by the api
 * layer, which owns that mapping already.
 */
export function toMessage(row: EmbedStoredMessage, cards: CourseCard[]): Message {
  return {
    id: row.id,
    session_id: 0,
    role: row.role,
    content: row.content,
    cards,
    chips: row.chips ?? [],
    blocks: [],
    feedback: null,
    created_at: row.created_at,
  };
}
