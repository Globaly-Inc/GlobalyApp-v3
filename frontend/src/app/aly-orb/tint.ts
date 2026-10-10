/**
 * The Aly orb, recoloured to a widget's brand colour.
 *
 * Every chatbot shows Aly — owners pick a colour, not a logo. The orb is drawn in azure blues
 * plus white highlights; each blue takes the brand's hue and saturation and keeps its own
 * lightness, shifted part of the way towards the brand's, so the shading and the animation
 * survive. Whites are untouched.
 */

type Hsl = [number, number, number];

function toHsl(hex: string): Hsl {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toHex([h, s, l]: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The orb's own base blue — the colour the brand replaces. */
const AZURE = toHsl("3E86FF");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Null for anything that isn't a 6-digit hex, so a bad `?c=` serves the original orb. */
export function parseBrand(value: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((value ?? "").trim());
  return m ? m[1]!.toUpperCase() : null;
}

export function tintOrb(svg: string, brandHex: string): string {
  const [hb, sb, lb] = toHsl(brandHex);
  return svg.replace(/#([0-9A-Fa-f]{6})\b/g, (match, hex: string) => {
    const [, s, l] = toHsl(hex);
    if (s < 0.2) return match; // whites and greys are the highlights
    const sat = clamp(sb * (s / AZURE[1]), 0, 1);
    const light = clamp(l + (lb - AZURE[2]) * 0.6, 0.08, 0.95);
    return `#${toHex([hb, sat, light])}`;
  });
}
