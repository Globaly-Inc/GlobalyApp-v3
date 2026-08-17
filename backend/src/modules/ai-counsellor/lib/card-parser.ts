export interface ParsedCard {
  id: string;
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
    .replace(/```course-card\n[\s\S]*?\n```/g, "")
    .replace(/```chips\n[\s\S]*?\n```/g, "")
    .trim();
}
