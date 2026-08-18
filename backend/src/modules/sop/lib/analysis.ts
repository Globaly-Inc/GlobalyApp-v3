// Draft analysis — pure functions, no model call.
//
// V1's `buildAnalysis` did the same thing for the same reason: the terminal analysis
// event was a heuristic over the text it had just streamed, not a second paid
// round-trip. Everything here is deterministic and testable offline, and none of it
// can fail in a way that costs a credit.
//
// The compliance half is what makes `sop_config` worth having: a UCAS statement over
// 4000 characters is rejected by UCAS itself, and a draft that opens with one of the
// banned phrases is the single most common reason an admissions reader stops reading.

export interface SopLimits {
  min_words: number | null;
  max_words: number | null;
  max_chars: number | null;
  banned_phrases: string[];
}

export interface SopAnalysis {
  word_count: number;
  char_count: number;
  /** Banned phrases actually present, in the order sop_config lists them. */
  banned_phrases_found: string[];
  within_word_limit: boolean;
  within_char_limit: boolean;
  /** 0–100. See `qualityScore`. */
  quality_score: number;
  quality_breakdown: Record<string, number>;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Case-insensitive substring search, which is how a reader encounters these phrases.
 * A regex built from the phrase would need escaping and buys nothing.
 */
export function findBannedPhrases(text: string, banned: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return banned.filter((phrase) => phrase.trim() !== "" && haystack.includes(phrase.toLowerCase()));
}

/** `null` limits mean "this destination does not set one", so they always pass. */
export function withinWordLimit(words: number, limits: SopLimits): boolean {
  if (limits.min_words !== null && words < limits.min_words) return false;
  if (limits.max_words !== null && words > limits.max_words) return false;
  return true;
}

export function withinCharLimit(chars: number, limits: SopLimits): boolean {
  return limits.max_chars === null || chars <= limits.max_chars;
}

/**
 * Three things a machine can actually judge, weighted and summed to 100:
 *
 *  * `length`     — inside the destination's word/char window.
 *  * `phrasing`   — free of the banned openings sop_config lists.
 *  * `specificity`— proportion of sentences carrying a concrete anchor (a number, a
 *                   date, or a capitalised name), which is V1's own SPECIFICITY RULE
 *                   turned into a measurement instead of a prompt instruction.
 *
 * Deliberately NOT a model call. V1's `scoreWithAI` spent a second paid generation on
 * ten subjective dimensions and was reachable without any wallet at all.
 */
const WEIGHTS = { length: 30, phrasing: 30, specificity: 40 } as const;

export function specificityRatio(text: string): number {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const anchored = sentences.filter((s) => /\d/.test(s) || /\b[A-Z][a-z]{2,}/.test(s.slice(1)));
  return anchored.length / sentences.length;
}

export function analyse(text: string, limits: SopLimits): SopAnalysis {
  const words = wordCount(text);
  const chars = text.length;
  const found = findBannedPhrases(text, limits.banned_phrases);
  const lengthOk = withinWordLimit(words, limits) && withinCharLimit(chars, limits);
  const specificity = specificityRatio(text);

  const breakdown = {
    length: lengthOk ? WEIGHTS.length : 0,
    phrasing: found.length === 0 ? WEIGHTS.phrasing : 0,
    specificity: Math.round(WEIGHTS.specificity * specificity),
  };

  return {
    word_count: words,
    char_count: chars,
    banned_phrases_found: found,
    within_word_limit: withinWordLimit(words, limits),
    within_char_limit: withinCharLimit(chars, limits),
    quality_score: breakdown.length + breakdown.phrasing + breakdown.specificity,
    quality_breakdown: breakdown,
  };
}

/**
 * How far this version has moved from the first draft, 0–100.
 *
 * V1 declared `edit_depth_pct` and a duplicated `content_v1` column to compute it
 * against, then never computed it — every row in its schema defaulted to 0. The
 * measure is a normalised Levenshtein distance capped at 100, which is bounded, cheap
 * on documents this size, and monotonic in the amount actually rewritten.
 *
 * ponytail: full O(n·m) DP over two rows. A 1000-word SOP is ~6KB, so ~36M char
 * comparisons worst case on a path that runs once per saved revision — fine. If
 * documents ever grow past a few tens of KB, switch to a token-level diff.
 */
export function editDepthPct(baseline: string, revised: string): number {
  if (baseline === revised) return 0;
  if (baseline.length === 0) return 100;
  const distance = levenshtein(baseline, revised);
  const pct = (distance / Math.max(baseline.length, revised.length)) * 100;
  return Math.round(Math.min(100, pct) * 100) / 100;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
