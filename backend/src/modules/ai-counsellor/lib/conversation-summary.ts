// Turns a stored conversation into the two things the summary email needs: the exchange, and
// the courses it surfaced.
//
// Pure, and separate from the worker that calls it, for two reasons: the worker is a script
// with a top-level `await tick()` and cannot be imported by a test, and this is the part with
// enough shape to get wrong — pairing, dedupe and truncation.

import type { ParsedCard } from "./card-parser.js";
import type { ChatSummaryProgram, ChatSummaryTurn } from "../../../shared/mail/templates.js";

/** Longest transcript we mail. A visitor who asked 80 questions does not want all 80 back. */
export const MAX_TURNS = 40;

/** Just the fields of a message row this needs — so a test does not have to build a whole one. */
export interface SummarisableMessage {
  role: string;
  content: string;
  cards?: unknown;
  sender_name?: string | null;
}

export interface ConversationSummary {
  turns: ChatSummaryTurn[];
  courses: string[];
  /** The course card shown LAST — where the chat ended up — for the email's program block. */
  program?: ChatSummaryProgram | null;
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
  let program: ChatSummaryProgram | null = null;
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
      // A staff reply after a takeover is still an answer, but must not read as the AI's.
      const answer = m.role === "agent" ? `${m.sender_name ?? "Our team"} (admissions team): ${m.content}` : m.content;
      turns.push({ question, answer });
      question = null;
    }

    const cards = (Array.isArray(m.cards) ? m.cards : []) as ParsedCard[];
    for (const c of cards) {
      if (!c?.name) continue;
      program = {
        name: c.name, institution: c.institution, city: c.city, duration: c.duration,
        study_modes: c.study_modes, intakes: c.intakes,
      };
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
  return { turns: turns.slice(-MAX_TURNS), courses: [...courses.values()], program };
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
  "Structure: '- ' bullets only, no opening line — one per distinct thing that was covered, in the",
  "order it came up — and finally, only if the conversation genuinely established them, a few",
  "'- ' bullets of concrete next steps.",
  "Start a bullet with '✓ ' instead of '- ' ONLY when the counsellor explicitly confirmed in the chat",
  "that the student meets a specific stated requirement (e.g. their IELTS score meets the English",
  "requirement). Never use ✓ for anything inferred, likely, or not stated in the chat.",
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

/**
 * The visitor page's summary, written for STAFF (not the visitor): a brief, what's still open, and
 * one next step. JSON so the card can lay each part out; `**bold**` marks the key facts.
 */
export const STAFF_SUMMARY_SYSTEM = [
  "You summarise a website chat between a prospective student and a university's assistant, for the university's staff.",
  "Return ONLY a JSON object, no prose, no code fence:",
  '{"title":"…","brief":"…","open":["…"],"next_step":"…"}',
  "title: at most six words naming what this chat was about (e.g. \"Scholarships for the MEng\"). No date, no name.",
  "brief: 1 to 2 sentences, third person, under 280 characters — who the student is and the facts that matter",
  "(background, scores, what they want). Wrap the key facts in **double asterisks**, at most four of them.",
  "open: up to 4 one- or two-word topics the student raised that are still unanswered (e.g. \"Fees\", \"Application\"). [] if none.",
  "next_step: one sentence telling the team what to do next, or \"\" if nothing is needed.",
  "Only facts from the chat. Never invent a score, fee, date or requirement. Say a requirement is met only if the chat said so.",
].join("\n");

export interface StaffSummary {
  title: string | null;
  brief: string;
  open: string[];
  next_step: string | null;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The model's JSON, bounded and cleaned; null when it isn't usable, so the old summary stays. */
export function parseStaffSummary(raw: string): StaffSummary | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
  const brief = clip(value?.brief, 400);
  if (!brief) return null;
  const open = (Array.isArray(value.open) ? value.open : [])
    .map((t) => clip(t, 30))
    .filter(Boolean)
    .slice(0, 4);
  return { title: clip(value.title, 60) || null, brief, open, next_step: clip(value.next_step, 240) || null };
}

/**
 * The CONTACT summary: the whole person, written from their profile and the summary of every chat
 * they've had — never the raw transcripts, so it stays one short call however many chats there are.
 */
export const CONTACT_SUMMARY_SYSTEM = [
  "You summarise one prospective student for a university's staff, from their profile and the summaries of every chat they've had on the website.",
  "Return ONLY a JSON object, no prose, no code fence:",
  '{"brief":"…","open":["…"],"next_step":"…"}',
  "brief: 1 to 2 sentences, third person, under 300 characters — who they are, what they want, and how that moved across chats.",
  "Wrap the key facts in **double asterisks**, at most four of them.",
  "open: up to 4 one- or two-word topics still unanswered across all chats. [] if none.",
  "next_step: one sentence telling the team what to do next, or \"\" if nothing is needed.",
  "Only facts from the input. Never invent a score, fee, date or requirement.",
].join("\n");

export interface ContactSummaryInput {
  profile: Record<string, unknown>;
  chats: { title: string | null; started: string; ended: boolean; text: string }[];
}

/** The contact-summary prompt: profile facts that are set, then each chat's summary in order. */
export function buildContactPrompt(input: ContactSummaryInput): string {
  const facts = Object.entries(input.profile)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  const chats = input.chats.map(
    (c, i) => `Chat ${i + 1} (${c.started}${c.ended ? ", ended" : ", in progress"})${c.title ? ` — ${c.title}` : ""}:\n${c.text}`,
  );
  return `Profile:\n${facts.join("\n") || "- nothing stated"}\n\nChats:\n\n${chats.join("\n\n")}`;
}

/** One summary email per chat: the visitor's id alone allowed only one, ever. */
export function summaryDedupKey(schema: string, visitorId: number, sessionId: number | null): string {
  return `chat_summary:${schema}:${visitorId}:${sessionId ?? "none"}`;
}

/**
 * The chat a summary email is for: the most recent chat the visitor ended since the last email,
 * or, when none (the quiet fallback for an unconfirmed chat), the chat they're in.
 */
export function pickSummaryChat(
  chats: { id: number; ended_at: Date | string | null }[],
  lastSentAt: Date | string | null,
  currentSessionId: number,
): number {
  const since = lastSentAt ? new Date(lastSentAt).getTime() : -Infinity;
  const ended = chats.filter((c) => c.ended_at && new Date(c.ended_at).getTime() > since);
  return ended.at(-1)?.id ?? currentSessionId;
}
