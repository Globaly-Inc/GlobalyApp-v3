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

// ── Thinking-stream labels ──

/**
 * Raw trace steps are engineering strings from the RAG pipeline and the tool loop
 * ("Courses: 8 found", "Context: 6149 chars, 10 sources"). Map each to the work it
 * actually did, keeping the real counts — the student watches the lookups go past
 * instead of a generic "Thinking".
 *
 * First match wins. Only the LATEST step is ever shown, and the pipeline's searches
 * run in parallel, so these flicker by in completion order.
 *
 * ponytail: a table of regexes against the backend's trace strings — they are a
 * display contract, not a wire format, so a renamed trace degrades to the fallback
 * label rather than breaking. self-check.ts pins every string the backend emits.
 */
const PHASES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  // Keywords arrive comma-joined; the search itself uses them space-joined, which is
  // also what reads like a query the student would recognise.
  [/^Keywords: (.+)/, (m) => `Looking up "${(m[1] ?? "").split(", ").slice(0, 4).join(" ")}" in our records`],
  [/^No searchable keywords extracted/, () => "Reading your question"],
  [/^No searchable keywords;/, () => "Re-reading the courses we just showed you"],
  [/^Country detected:/, () => "Narrowing down by country"],
  [/^Courses: skipped/, () => "Getting a feel for what you're after"],
  [/^Courses: 0 found/, () => "No course match yet — checking everything else"],
  [/^Courses: (\d+) found/, (m) => `Matched ${m[1]} ${m[1] === "1" ? "course" : "courses"} in our catalogue`],
  [/^Course search failed/, () => "Course lookup didn't answer — using what else we have"],
  [/^(Visas|Visa knowledge):/, () => "Checking visa rules"],
  [/^Institutions:/, () => "Checking institution records"],
  [/^Own profile:/, () => "Checking our own details"],
  [/^(Agents|MARA agents):/, () => "Checking registered agents"],
  [/^FAQs:/, () => "Checking our FAQs"],
  [/^Country guides:/, () => "Reading country guides"],
  [/^This website: (\d+) passages/, (m) => `Reading ${m[1]} passages from our website`],
  [/^Knowledge rack: (\d+) chunks/, (m) => `Reading ${m[1]} passages from our knowledge base`],
  [/^Hydrating (\d+) courses/, (m) => `Pulling fees and study options for ${m[1]} courses`],
  [/^Hydrated:/, () => "Fees and study options ready"],
  [/^Context: \d+ chars, (\d+) sources/, (m) => `Analysing ${m[1]} ${m[1] === "1" ? "source" : "sources"} and preparing your answer`],
  [/^Money question/, () => "Double-checking what we can confirm on costs"],
  [/^Retrying without tools/, () => "Taking another run at it"],
  [/failed/, () => "One lookup didn't answer — using the rest"],
];

/** Tool-loop steps ("Searching courses…", "Searched visas: nursing — 4 found") are already
 * student-readable; keep the verb phrase and drop the internal query/count detail. */
const TOOL_STEP = /^(Searching|Searched|Reading|Read|Noted) [a-z]/;

export function thinkingPhase(step: string | undefined): string {
  if (!step) return "Getting started";
  if (TOOL_STEP.test(step)) return (step.split(/[:…]/)[0] ?? step).trim();
  for (const [re, label] of PHASES) {
    const match = step.match(re);
    if (match) return label(match);
  }
  return "Working on it";
}
