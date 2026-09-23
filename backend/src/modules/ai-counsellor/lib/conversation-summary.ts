// Turns a stored conversation into the two things the summary email needs: the exchange, and
// the courses it surfaced.
//
// Pure, and separate from the worker that calls it, for two reasons: the worker is a script
// with a top-level `await tick()` and cannot be imported by a test, and this is the part with
// enough shape to get wrong — pairing, dedupe and truncation.

import type { ParsedCard } from "./card-parser.js";
import type { ChatSummaryTurn } from "../../../shared/mail/templates.js";

/** Longest transcript we mail. A visitor who asked 80 questions does not want all 80 back. */
export const MAX_TURNS = 40;

/** Just the fields of a message row this needs — so a test does not have to build a whole one. */
export interface SummarisableMessage {
  role: string;
  content: string;
  cards?: unknown;
}

export interface ConversationSummary {
  turns: ChatSummaryTurn[];
  courses: string[];
}

/**
 * Pair user questions with the answers that followed, and collect every course card shown.
 *
 * Courses come from the `cards` already persisted on each assistant message — the same cards
 * the visitor saw in the widget. That is what makes "programs we discussed" possible without
 * a model call: the structured data was captured at the time and never thrown away.
 *
 * `messages` must be oldest-first, which is what messagesRepo.findBySession returns.
 */
export function summariseConversation(messages: SummarisableMessage[]): ConversationSummary {
  const turns: ChatSummaryTurn[] = [];
  const courses = new Map<string, string>();
  let question: string | null = null;

  for (const m of messages) {
    if (m.role === "user") {
      // Two user messages in a row (they sent again before the answer landed): the later one
      // is what the answer actually addresses, so it wins.
      question = m.content;
      continue;
    }

    // An assistant message with no question before it is an opening greeting, not an answer.
    if (question !== null) {
      turns.push({ question, answer: m.content });
      question = null;
    }

    const cards = (Array.isArray(m.cards) ? m.cards : []) as ParsedCard[];
    for (const c of cards) {
      if (!c?.name) continue;
      // Keyed on name + institution so two universities' "MSc Data Science" both survive,
      // while the same course repeated across five answers appears once.
      const key = `${c.name}|${c.institution ?? ""}`;
      if (!courses.has(key)) {
        courses.set(key, c.institution ? `${c.name} — ${c.institution}` : c.name);
      }
    }
  }

  // Keep the most recent exchanges: the tail is where the conversation got specific. Courses
  // are NOT trimmed with it — a program mentioned early is still one they were interested in.
  return { turns: turns.slice(-MAX_TURNS), courses: [...courses.values()] };
}

/** Longest transcript we feed the model. Beyond this the tail is what matters anyway. */
const PROMPT_TURN_LIMIT = 30;
/** Per-answer cap going INTO the prompt — a single long answer must not crowd out the rest. */
const PROMPT_ANSWER_CHARS = 1200;

const SUMMARY_SYSTEM = [
  "You are writing a recap of a study-abroad counselling chat, addressed to the student who had it.",
  "Write in second person (\"you asked\", \"we covered\"). Warm and plain, never salesy.",
  "Recap the WHOLE conversation: what the student was looking for, each distinct thing they asked",
  "about, and what they were told — fees, intakes, entry requirements, campuses, study modes,",
  "application steps, whatever actually came up.",
  "The programs are already listed separately in the email, so do not just re-list them;",
  "mention one only where it explains a point.",
  "Cover only what the conversation actually contained. Never invent a course, fee, date or requirement.",
  "If the chat was too short to recap, say so in one sentence rather than padding.",
  "Structure: one short opening line naming what they were looking for, then '- ' bullets —",
  "one per distinct thing that was covered, in the order it came up — and finally, only if the",
  "conversation genuinely established them, a few '- ' bullets of concrete next steps.",
  "A bullet is one self-contained sentence carrying the actual detail (the figure, the date, the",
  "requirement), not a topic label: '- The certificate runs 39 weeks and costs USD 8,400.' rather",
  "than '- Duration and fees.'",
  "End EVERY bullet with a full stop.",
  "Keep the whole recap under about 180 words — it is a reminder, not a transcript.",
  "Finish every sentence. Plain text only. No markdown headings, no bold, no links,",
  "and no preamble like 'Here is a summary'.",
].join(" ");

/**
 * The prompt for the summary email.
 *
 * Built from the stored transcript rather than from a live model session, so it is a pure
 * function of rows that already exist — the same summary is reproducible from the database
 * long after the conversation, and a failed send can be retried without re-running the chat.
 */
export function buildSummaryPrompt(
  summary: ConversationSummary,
  orgName: string | null,
): { system: string; prompt: string } {
  const courses = summary.courses.length
    ? `\nPrograms shown to the student during the chat:\n${summary.courses.map((c) => `- ${c}`).join("\n")}\n`
    : "";

  const transcript = summary.turns
    .slice(-PROMPT_TURN_LIMIT)
    .map((t) => `Student: ${t.question}\nCounsellor: ${t.answer.slice(0, PROMPT_ANSWER_CHARS)}`)
    .join("\n\n");

  return {
    system: SUMMARY_SYSTEM,
    prompt: `${orgName ? `The chat was with ${orgName}'s AI counsellor.\n` : ""}${courses}\nTranscript:\n\n${transcript}`,
  };
}

/**
 * Is there enough here to be worth a model call?
 *
 * A one-exchange chat summarises to a sentence longer than the exchange itself, and each call
 * costs money per captured lead. Below this the transcript IS the summary.
 */
export function worthSummarising(summary: ConversationSummary): boolean {
  return summary.turns.length >= 2;
}


/**
 * Does this read as a finished piece of writing?
 *
 * `gemini-3.5-flash` is a thinking model and its reasoning is drawn from the SAME
 * maxOutputTokens budget as its answer, so too small a budget does not fail — it returns a
 * recap that stops mid-sentence, which is worse than no recap at all because it still gets
 * mailed. A cheap shape check catches that and lets the caller fall back to the transcript.
 */
export function looksTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // A bulleted ending used to be exempted here, because a "next steps" list rarely carries final
  // punctuation. That exemption became a hole the moment the recap itself became a bullet list:
  // EVERY recap now ends on a bullet, so the guard would have been permanently off, and a recap
  // clipped mid-bullet ("- The certificate runs 39 weeks and costs USD 8,") would have been
  // mailed as complete. The prompt now requires a full stop on every bullet, which is what lets
  // the same punctuation check cover both shapes.
  return !/[.!?:"'\u201d\u2019)]$/.test(trimmed);
}


/** Below this, a salvaged recap is too thin to be worth sending in place of the transcript. */
const MIN_SALVAGE_CHARS = 120;

/**
 * Rescue a recap that ran out of budget, by cutting back to its last finished sentence.
 *
 * Discarding the whole thing was the first instinct and it is too blunt: the visitor asked for
 * a recap, and three good paragraphs with a fourth clipped are worth far more to them than the
 * raw Q&A we fall back to. Only when there is nothing whole left does the transcript win.
 *
 * Returns "" when too little survives, which the caller reads as "use the transcript".
 */
export function trimToCompleteSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!looksTruncated(trimmed)) return trimmed;

  const cut = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (cut < 0) return "";

  const salvaged = trimmed.slice(0, cut + 1).trim();
  return salvaged.length >= MIN_SALVAGE_CHARS ? salvaged : "";
}
