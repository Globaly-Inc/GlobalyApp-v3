export interface ParsedCard {
  id: string;
  /** `{slugified-name}-{id-fragment}` for the internal /course/[slug] page. */
  slug?: string;
  name: string;
  institution: string;
  degree_level?: string;
  duration?: string;
  fees?: number;
  currency?: string;
  country?: string;
  city?: string;
  intakes?: string[];
  study_modes?: string[];
  source_url?: string;
}

/* ── Generic UI blocks ──
 * The model emits ```block fences containing one typed JSON object; the
 * frontend maps each type to a React component. course-card/chips predate
 * this and keep their own fences for backward compatibility. */

type Action = { label: string; value: string };

export type ResponseBlock =
  | { type: "comparison"; title?: string; columns: string[]; rows: { label: string; values: string[] }[] }
  | { type: "breakdown"; title?: string; items: { title: string; description?: string }[] }
  | { type: "timeline"; title?: string; steps: { title: string; description?: string }[] }
  | { type: "recommendation"; title: string; subtitle?: string; description?: string; image_url?: string; tags?: string[]; actions?: Action[] }
  | { type: "image"; url: string; title?: string; caption?: string }
  | { type: "quick_replies"; question?: string; options: Action[] };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isActions = (v: unknown): v is Action[] =>
  Array.isArray(v) && v.length > 0 && v.every((o) => isStr(o?.label) && isStr(o?.value));

/** Per-type shape checks — just enough that the frontend can render without crashing. */
const VALIDATORS: Record<string, (b: Record<string, unknown>) => boolean> = {
  comparison: (b) =>
    Array.isArray(b.columns) && b.columns.every(isStr) &&
    Array.isArray(b.rows) && b.rows.every((r) => isStr(r?.label) && Array.isArray(r?.values)),
  breakdown: (b) => Array.isArray(b.items) && b.items.length > 0 && b.items.every((i) => isStr(i?.title)),
  timeline: (b) => Array.isArray(b.steps) && b.steps.length > 0 && b.steps.every((s) => isStr(s?.title)),
  recommendation: (b) => isStr(b.title) && (b.actions === undefined || isActions(b.actions)),
  image: (b) => isStr(b.url) && /^https?:\/\//.test(b.url as string),
  quick_replies: (b) => isActions(b.options),
};

/** Extract ```block fences from Gemini output. Unknown/malformed types are dropped. */
export function parseBlocks(text: string): ResponseBlock[] {
  const blocks: ResponseBlock[] = [];
  const regex = /```block\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const validate = typeof parsed?.type === "string" ? VALIDATORS[parsed.type] : undefined;
      if (validate?.(parsed)) blocks.push(parsed as unknown as ResponseBlock);
    } catch { /* skip malformed */ }
  }
  return blocks;
}

/** Extract COURSE_CARD JSON blocks from Gemini output. */
export function parseCards(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const regex = /```course-card\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.id && parsed.name && parsed.institution) {
        cards.push(parsed as ParsedCard);
      }
    } catch { /* skip malformed */ }
  }
  return cards;
}

/** Extract CHIPS array from Gemini output. */
export function parseChips(text: string): string[] {
  const match = /```chips\n([\s\S]*?)\n```/.exec(text);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** Remove structured blocks from display text (they're sent as separate SSE events). */
export function stripBlocks(text: string): string {
  return text
    .replace(/```(?:course-card|chips|block)\n[\s\S]*?\n```/g, "")
    .trim();
}
