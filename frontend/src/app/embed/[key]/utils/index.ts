import type React from "react";
import type { CourseCard, Message } from "@/app/ai/apis/types";
import { uuid } from "@/lib/utils";
import type { EmbedFile, EmbedStoredMessage } from "../apis/types";

/** The widget's message: the shared one, plus the signed files a staff member sent. */
export type WidgetMessage = Message & { files?: EmbedFile[] };

/**
 * A stored turn from `/guest/session` in the shape the shared chat renderer wants.
 *
 * Real ids are kept (they're rows in `ai_counselor_messages` now, not the widget's old
 * throwaway negatives), so a restored message can carry feedback later without a second
 * mapping. Cards come back in the backend's prompt format and are converted by the api
 * layer, which owns that mapping already.
 */
export function toMessage(row: EmbedStoredMessage, cards: CourseCard[]): WidgetMessage {
  return {
    sender_name: row.sender_name ?? null,
    files: row.role === "agent" ? (row.attachments as EmbedFile[] | undefined)?.filter((f) => f?.url) : undefined,
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

/** "217 100% 62%" — the raw triplet shape globals.css keeps --gold in. */
function hslTriplet([r, g, b]: readonly [number, number, number]): string {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return `${Math.round(h * 60)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance, for the readable-foreground test below. */
function luminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black rather than pure black: it reads as ink on a mid-tone, not as a hole. */
const INK = "#0B1220";
/** Measured, not typed in: a hand-written value here silently shifts the ink/white crossover. */
const INK_LUMINANCE = luminance([0x0b, 0x12, 0x20]);

/**
 * Everything the panel derives from ONE brand colour.
 *
 * `onAccent` is the point of this: a tenant can save any hex, so nothing may assume white text
 * survives on it. The foreground is whichever of ink/white actually contrasts better, measured —
 * so a navy university and a bright-yellow language school both stay readable without either of
 * them configuring anything.
 *
 * `vars` retints the SHARED chat components (chat-input, chat-message, suggested-starters,
 * thinking-indicator). They are styled entirely with semantic tokens, so overriding those tokens
 * on the panel's root is the whole integration — none of them is modified, and the in-app Ask Aly
 * chat is untouched by construction. Surfaces (`--background`, `--muted`) deliberately stay
 * neutral: the brand carries the INTERACTIVE layer, not every panel in the conversation.
 *
 * Unparseable input (named colours, hsl(), garbage) falls back to the app's indigo.
 */
export function widgetTheme(brand?: string | null): {
  accent: string;
  onAccent: string;
  heroBackground: string;
  soft: string;
  vars: React.CSSProperties;
} {
  const m = /^#?([0-9a-f]{6})$/i.exec((brand ?? "").trim());
  const n = parseInt(m ? m[1]! : "4f46e5", 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  const rgba = (a: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  const accent = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

  // Contrast ratio against each candidate, best one wins — not a lightness threshold, which
  // misjudges saturated mid-tones like a strong green.
  const L = luminance(rgb);
  const vsWhite = 1.05 / (L + 0.05);
  const vsInk = (L + 0.05) / (INK_LUMINANCE + 0.05);
  const onAccent = vsInk > vsWhite ? INK : "#FFFFFF";

  return {
    accent,
    onAccent,
    heroBackground: `linear-gradient(180deg, ${rgba(0.22)} 0%, ${rgba(0.08)} 45%, transparent 100%)`,
    soft: rgba(0.08),
    vars: {
      "--primary": accent,
      "--primary-foreground": onAccent,
      "--ring": accent,
      // `bg-accent` is a hover surface in this app; at full strength the brand would shout on
      // every hover, so it gets the soft tint instead.
      "--accent": rgba(0.1),
      "--accent-foreground": "var(--foreground)",
      // --gold is a raw "h s% l%" triplet (globals.css) and tints the starters' glow.
      "--gold": hslTriplet(rgb),
    } as React.CSSProperties,
  };
}

/**
 * Staff replies the widget hasn't shown yet, appended in order.
 *
 * Only agent rows: the visitor's own turns and the AI's replies already arrived through their own
 * send (with temporary ids), so taking those from the poll too would show them twice.
 */
export function withNewAgentRows(
  prev: WidgetMessage[],
  stored: EmbedStoredMessage[],
  toCards: (cards: EmbedStoredMessage["cards"]) => CourseCard[],
): WidgetMessage[] {
  const seen = new Set(prev.map((m) => m.id));
  const fresh = stored.filter((row) => row.role === "agent" && !seen.has(row.id));
  return fresh.length ? [...prev, ...fresh.map((row) => toMessage(row, toCards(row.cards)))] : prev;
}

const FINGERPRINT_KEY = "globaly_embed_fp";

/** This browser's stable widget identity (never sent anywhere but this widget's own API). */
export function getFingerprint(): string {
  // The host page's iframe gets storage partitioned by top-level site, so the expanded tab
  // has its own localStorage and would start a blank thread. The expand link hands the
  // iframe's fingerprint over in the hash (never sent to a server); adopt it, then drop it.
  const handed = new URLSearchParams(location.hash.slice(1)).get("fp");
  if (handed) {
    localStorage.setItem(FINGERPRINT_KEY, handed);
    history.replaceState(null, "", location.pathname + location.search);
  }
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    fp = uuid();
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}
