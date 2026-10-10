import type { LucideIcon } from "lucide-react";
import {
  Ban, BookMarked, Brain, Globe, GraduationCap, MessageSquareQuote, Palette, ScrollText, Sparkles, Users,
} from "lucide-react";
import type { MemorySource, MemoryStatus, MemoryType, ReviewStatus } from "../apis/types";
import type { MemoryFilter } from "../types";

/**
 * The page's three halves. Style is how it answers, Memories is what it knows, Conversations is
 * where it gets corrected. Style leads because it is the thing an institution sets on day one —
 * the other two fill up over time.
 */
export const KNOWLEDGE_TABS = [
  { value: "style", label: "How it answers" },
  { value: "memories", label: "What it knows" },
  { value: "conversations", label: "Review replies" },
  { value: "insights", label: "How visitors convert" },
] as const;

/**
 * Status filter capsules. "All" is a real option and is clickable like the rest — a capsule you
 * cannot press reads as a broken filter.
 *
 * `deleted` is deliberately absent: the backend soft-deletes to keep history and the list endpoint
 * never returns those rows, so a tab for it would always be empty.
 */
export const MEMORY_FILTERS: readonly { value: MemoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "candidate", label: "Awaiting review" },
  { value: "active", label: "In use" },
  { value: "conflicting", label: "Conflicting" },
  { value: "flagged", label: "Flagged" },
  { value: "deprecated", label: "Retired" },
];

export const MEMORY_TYPE_META: Record<MemoryType, { label: string; icon: LucideIcon; hint: string }> = {
  COUNSELLING_GUIDELINE: { label: "Guideline", icon: ScrollText, hint: "How your counsellors want the conversation handled." },
  RESPONSE_PREFERENCE: { label: "Style", icon: Palette, hint: "Tone and shape of the reply. Applied to every answer." },
  RESPONSE_PATTERN: { label: "Technique", icon: Sparkles, hint: "A way of answering, and when to use it." },
  INSTITUTION_POLICY: { label: "Policy", icon: BookMarked, hint: "Something your institution has decided." },
  COURSE_RECOMMENDATION_RULE: { label: "Recommendation rule", icon: GraduationCap, hint: "What to put forward, and what to hold back." },
  TERMINOLOGY: { label: "Wording", icon: MessageSquareQuote, hint: "The words you want used, and the ones you don't." },
  STUDENT_CONCERN_PATTERN: { label: "Common concern", icon: Users, hint: "Something visitors often worry about, and how to meet it." },
  COUNSELLOR_CORRECTION: { label: "Correction", icon: Brain, hint: "A reply one of your team rewrote. Stored as your words." },
  AVOIDANCE_RULE: { label: "Never do", icon: Ban, hint: "A hard limit. Applied to every answer." },
  GENERAL_CONTEXT: { label: "Context", icon: ScrollText, hint: "Background the counsellor should carry." },
  GENERAL_KNOWLEDGE: {
    label: "General knowledge", icon: Globe,
    hint: "A fact about studying abroad, not about your institution. The only kind your counsellor "
      + "may propose with figures in it — and the only kind that always waits for you, however "
      + "often it comes up.",
  },
};

/** The types an institution writes by hand. The rest arrive from corrections and learning. */
export const AUTHORABLE_TYPES: readonly MemoryType[] = [
  "COUNSELLING_GUIDELINE", "AVOIDANCE_RULE", "RESPONSE_PREFERENCE", "INSTITUTION_POLICY",
  "TERMINOLOGY", "COURSE_RECOMMENDATION_RULE",
];

export const STATUS_META: Record<MemoryStatus, { label: string; tone: "ok" | "pending" | "muted" }> = {
  active: { label: "In use", tone: "ok" },
  candidate: { label: "Awaiting review", tone: "pending" },
  deprecated: { label: "Retired", tone: "muted" },
  deleted: { label: "Deleted", tone: "muted" },
};

/** Where it came from, in the institution's language rather than the column's. */
export const SOURCE_LABEL: Record<MemorySource, string> = {
  admin: "Added by your team",
  correction: "From a correction",
  feedback: "From visitor feedback",
  extracted: "Learned from conversations",
};

export const REVIEW_META: Record<ReviewStatus, { label: string }> = {
  approved: { label: "Approved" },
  corrected: { label: "Corrected" },
  flagged: { label: "Flagged" },
};

/** Matches TRANSITION_SCAN_LIMIT in institution-memory/repositories/signals.repository.ts —
 *  how many of the most recent conversations the pattern mining actually reads. */
export const TRANSITION_SCAN_LIMIT = 5000;

/** Matches PROMOTION_MIN_ACTORS in institution-memory/services/memory.service.ts. */
export const PROMOTION_MIN_ACTORS = 3;
/** Matches CANDIDATE_TTL_DAYS. A candidate nobody reviews is retired automatically. */
export const CANDIDATE_TTL_DAYS = 90;

export const MEMORY_PAGE_SIZE = 100;
/** The list endpoint's own ceiling (memory.schema.ts: `limit ... .max(200)`). Asking for more is
 *  a 400, so the header's unfiltered read takes exactly this and reports "200+" when it fills. */
export const SUMMARY_LIMIT = 200;
export const CONVERSATION_PAGE_SIZE = 50;

// ── Knowledge Rack configuration ─────────────────────────────────────────────
// Every option is phrased as what the counsellor WILL DO, not as the setting's name. Labels are
// what someone picks between; the hint under each group says why it matters.

export type Choice<T extends string> = { value: T; label: string };

export const TONE_CHOICES: Choice<string>[] = [
  { value: "warm", label: "Warm and personable" },
  { value: "neutral", label: "Even and matter-of-fact" },
  { value: "formal", label: "Formal and professional" },
  { value: "enthusiastic", label: "Enthusiastic about what you offer" },
];

export const LENGTH_CHOICES: Choice<string>[] = [
  { value: "brief", label: "Short — the answer and one more sentence" },
  { value: "standard", label: "Full, without padding" },
  { value: "detailed", label: "The full picture, including context" },
];

export const STYLE_CHOICES: Choice<string>[] = [
  { value: "consultative", label: "Understand their situation first" },
  { value: "directive", label: "Give a clear recommendation" },
  { value: "informational", label: "Answer what was asked, don't steer" },
];

export const FOLLOW_UP_CHOICES: Choice<string>[] = [
  { value: "always", label: "Always end with a question" },
  { value: "when_unclear", label: "Only when the answer depends on it" },
  { value: "never", label: "Never — answer and stop" },
];

export const RECOMMENDATION_CHOICES: Choice<string>[] = [
  { value: "brief_reason", label: "One reason it fits them" },
  { value: "full_rationale", label: "Full reasoning, including trade-offs" },
  { value: "comparison", label: "Against the nearest alternative" },
];

export const UNCERTAINTY_CHOICES: Choice<string>[] = [
  { value: "say_unknown", label: "Say plainly that it doesn't know" },
  { value: "offer_to_check", label: "Offer to have someone check" },
  { value: "defer_to_human", label: "Point them to a human counsellor" },
];

export const LEAD_CHOICES: Choice<string>[] = [
  { value: "never_ask", label: "Never ask — record details only if offered" },
  { value: "when_natural", label: "Ask at a natural point in the conversation" },
  { value: "actively_offer", label: "Offer to follow up by email" },
];

export const INITIATIVE_CHOICES: Choice<string>[] = [
  { value: "reactive", label: "Answer what is asked, nothing more" },
  { value: "balanced", label: "Raise what materially affects them" },
  { value: "proactive", label: "Flag deadlines and next steps unprompted" },
];

export const SCALE_CHOICES: Choice<string>[] = [
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" },
];

/**
 * Reply languages. Codes are ISO 639-1; the names come from `Intl.DisplayNames`, so there is no
 * second table of language names here to translate and keep current. English is the default and
 * matches `VoiceSchema.language` on the backend.
 */
const LANGUAGE_CODES = (
  "en es fr de it pt nl sv da nb fi is pl ru uk tr ar fa he hi ne bn ur pa gu mr ta te kn ml si "
  + "th vi id ms tl my km lo zh ja ko el cs sk hu ro bg sr hr sl et lv lt sq mk ka hy az kk uz "
  + "ps am sw ha yo ig zu af"
).split(" ");

/** Exported so a stored tag the list does not carry can still be labelled with a real name. */
export const languageName = (code: string): string => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const LANGUAGE_CHOICES: Choice<string>[] = [
  { value: "", label: "Match the visitor's language" },
  ...LANGUAGE_CODES
    .map((value) => ({ value, label: languageName(value) }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

/** What each collectable field is, in a visitor's terms rather than a column's. */
export const FIELD_LABEL: Record<string, string> = {
  age: "Age", gender: "Gender", nationality: "Nationality",
  study_preference: "The course they ask about",
  qualifications: "Qualifications", language_tests: "English test results",
  academic_tests: "Admission test results", work_experiences: "Work history",
  name: "Name", email: "Email address", phone: "Phone number",
};

/** Off by default, and the page says why. */
export const FIELD_CAUTION: Record<string, string> = {
  age: "Collected from every visitor today with no stated purpose — off unless you need it.",
  gender: "Collected from every visitor today with no stated purpose — off unless you need it.",
};

/** The journey vocabulary, in a visitor's terms rather than the classifier's. */
export const TOPIC_LABEL: Record<string, string> = {
  course: "Courses", eligibility: "Eligibility", fees: "Fees", scholarship: "Scholarships",
  application: "Applying", visa: "Visas", accommodation: "Accommodation",
  contact: "Talking to someone", other: "Something else",
};
