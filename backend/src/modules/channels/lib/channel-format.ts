// Turns the counsellor's website answer into a WhatsApp / Instagram / Facebook message.
//
// The model writes the SAME answer it writes for the widget — markdown lists and bold, plus
// course cards and structured blocks the widget renders as UI. A phone chat has none of that UI,
// so this keeps the structure as text instead of asking the model for flat prose:
//   WhatsApp   *bold*, _italic_, • bullets (WhatsApp renders its own markers)
//   Instagram / Facebook   no markup at all (they show markers literally), • bullets
// Cards and blocks become bulleted lines under the answer.

import type { ParsedCard, ResponseBlock } from "../../ai-counsellor/lib/card-parser.js";
import type { Channel } from "../consts.js";

/** Each platform's text limit; a longer message is rejected, not cut. */
export const CHANNEL_TEXT_LIMIT: Record<Channel, number> = { whatsapp: 4096, instagram: 1000, facebook: 2000 };

const MAX_CARDS = 3;
const OPEN = "\u0001";
const CLOSE = "\u0002";

/** Markdown → the platform's own formatting (or none). */
export function markdownToChannel(text: string, channel: Channel): string {
  const wa = channel === "whatsapp";
  const bold = (s: string) => (wa ? `${OPEN}${s}${CLOSE}` : s);
  return text
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, (_, h: string) => bold(h))
    .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, a?: string, b?: string) => bold((a ?? b)!))
    // Single-star italic, only around a word ("*why it fits*"), never a bullet's leading "* ".
    .replace(/(^|[\s(])\*(?![\s*])([^*\n]+?)\*(?=[\s.,;:!?)]|$)/gm, (_, pre: string, s: string) => `${pre}${wa ? `_${s}_` : s}`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/^(\s*)[-*+]\s+/gm, (_, indent: string) => (indent.length >= 2 ? "   ◦ " : "• "))
    .replace(new RegExp(`${OPEN}([^${CLOSE}]*)${CLOSE}`, "g"), "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cardLine(c: ParsedCard, channel: Channel): string {
  const name = channel === "whatsapp" ? `*${c.name}*` : c.name;
  const fee = c.fees != null ? `${c.currency ?? ""} ${c.fees.toLocaleString("en")}${c.fee_period ? ` ${c.fee_period}` : ""}`.trim() : null;
  const meta = [c.degree_level, c.duration, c.city ?? c.country, fee].filter(Boolean).join(" · ");
  return [`• ${name}`, meta && `   ${meta}`, c.source_url && `   ${c.source_url}`].filter(Boolean).join("\n");
}

function blockText(b: ResponseBlock, channel: Channel): string | null {
  const title = (t?: string) => (t ? (channel === "whatsapp" ? `*${t}*` : t) : null);
  const items = (list: { title: string; description?: string }[], numbered: boolean) =>
    list.map((i, n) => `${numbered ? `${n + 1}.` : "•"} ${i.title}${i.description ? ` — ${i.description}` : ""}`);
  switch (b.type) {
    case "breakdown": return [title(b.title), ...items(b.items, false)].filter(Boolean).join("\n");
    case "timeline": return [title(b.title), ...items(b.steps, true)].filter(Boolean).join("\n");
    case "recommendation": return [title(b.title), b.subtitle, b.description].filter(Boolean).join("\n");
    case "quick_replies": return [b.question, ...b.options.map((o) => `• ${o.label}`)].filter(Boolean).join("\n");
    default: return null; // images, links and tables need the widget
  }
}

/**
 * The whole reply as one platform message: the answer, then any blocks and course cards as text.
 * Kept under the platform's limit by dropping the extras first, then cutting at a paragraph.
 * ponytail: one message, cut at the limit; split into several sends if long answers get cut often.
 */
export function formatForChannel(
  reply: { cleanText: string; cards: ParsedCard[]; blocks: ResponseBlock[] },
  channel: Channel,
): string {
  const answer = markdownToChannel(reply.cleanText, channel);
  const extras = [
    ...reply.blocks.map((b) => blockText(b, channel)).filter((t): t is string => !!t),
    reply.cards.length ? reply.cards.slice(0, MAX_CARDS).map((c) => cardLine(c, channel)).join("\n") : null,
  ].filter((t): t is string => !!t);
  const limit = CHANNEL_TEXT_LIMIT[channel];
  const full = [answer, ...extras].filter(Boolean).join("\n\n");
  if (full.length <= limit) return full;
  if (answer.length <= limit) return answer;
  const cut = answer.slice(0, limit - 1);
  const at = cut.lastIndexOf("\n\n");
  return `${at > limit / 2 ? cut.slice(0, at) : cut.trimEnd()}…`;
}
