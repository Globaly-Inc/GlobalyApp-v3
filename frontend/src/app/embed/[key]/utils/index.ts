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

/**
 * Everything the panel derives from ONE brand colour: a deep wash at the top of the hero
 * fading to the page background a little past halfway, plus a soft tint for chips.
 * Unparseable input (named colours, hsl(), garbage) falls back to the app's indigo.
 */
export function widgetTheme(brand?: string | null): { accent: string; heroBackground: string; soft: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec((brand ?? "").trim());
  const n = parseInt(m ? m[1]! : "4f46e5", 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  const rgba = (a: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  return {
    accent: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    heroBackground: `linear-gradient(180deg, ${rgba(0.22)} 0%, ${rgba(0.08)} 45%, transparent 100%)`,
    soft: rgba(0.08),
  };
}
