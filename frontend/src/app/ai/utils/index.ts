/**
 * Strip ```course-card / ```chips blocks from AI text — they arrive as separate
 * SSE events and render as cards/buttons, not prose. Mirrors the backend's
 * card-parser stripBlocks, plus hides a trailing block that is still streaming
 * (a half-received fence would otherwise flash as a growing code block).
 */
export function stripStructuredBlocks(text: string): string {
  return text
    .replace(/```(?:course-card|chips|block)\n[\s\S]*?\n```/g, "")
    .replace(/```(?:course-card|chips|block)[\s\S]*$/, "")
    .trim();
}

const QUOTE_MAX = 220;

/**
 * Reply-to-a-message is carried in the message text itself as a leading markdown
 * quote line — no new column, and the model reads the quote as context for free.
 * ponytail: text-carried quote; give it its own DB column if replies ever need
 * to link back to the exact message id.
 */
export function withQuote(text: string, quoted: string): string {
  const flat = quoted.replace(/\s+/g, " ").trim();
  const excerpt = flat.length > QUOTE_MAX ? flat.slice(0, QUOTE_MAX) + "…" : flat;
  return `> ${excerpt}\n\n${text}`;
}

/** Inverse of withQuote, for rendering the quote as a strip instead of a literal "> ". */
export function splitQuote(content: string): { quote: string | null; body: string } {
  if (!content.startsWith("> ")) return { quote: null, body: content };
  const [first = "", ...rest] = content.split("\n\n");
  return { quote: first.slice(2), body: rest.join("\n\n") };
}
