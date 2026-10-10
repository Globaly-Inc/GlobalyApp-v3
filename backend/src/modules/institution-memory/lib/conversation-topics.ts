// Coarse topic labels for a conversation, by keyword.
//
// NOT a model call, and that is a deliberate cost decision rather than a shortcut. Every widget
// conversation would otherwise pay one extra LLM round trip to produce eight possible words, on
// a platform where the standing instruction is to minimise model spend. Keywords are free,
// deterministic, and testable without a key — and when the labels prove too crude to answer a
// real question, a model can be swapped in behind this same function signature.
//
// The vocabulary is FIXED on purpose. These labels end up in institution_conversation_signals,
// and a label derived from the visitor's own phrasing would put their words in a table that is
// explicitly free of them. "fees" is a category; "can I pay in instalments from Nepal" is not.

export const TOPICS = [
  "course", "eligibility", "fees", "scholarship", "application", "visa", "accommodation", "contact", "other",
] as const;
export type Topic = (typeof TOPICS)[number];

/**
 * Ordered, first match wins — so precedence is a property of this list rather than an accident
 * of regex alternation. The order encodes what a message is ABOUT when it mentions two things:
 * "what are the fees for the MBA" is a fees question that happens to name a course,
 * "do I qualify for a scholarship" is about the scholarship rather than about qualifying, and
 * "what are the living costs" is about living somewhere rather than about cost.
 */
const RULES: ReadonlyArray<readonly [Topic, RegExp]> = [
  // EVERY alternation is wrapped in (?:...) — `\ba|b|c\b` anchors \b to the first and last
  // alternative ONLY, so the middle ones matched anywhere inside a word. "costume" was a fees
  // question and "living cost" never reached the accommodation rule below it.
  //
  // Stems take \w* rather than a trailing \b, for the same reason the sensitive-category filter
  // does: `\beligib\b` matches neither "eligible" nor "eligibility", which is every real form.
  ["scholarship", /\b(?:scholarship\w*|bursar\w*|financial aid|funding)\b/i],
  // ABOVE fees deliberately: an accommodation question almost always mentions cost, and
  // "what are the living costs" is about living somewhere, not about tuition. A fees question
  // carries no housing word, so nothing travels the other way.
  ["accommodation", /\b(?:accommodat\w*|housing|hostel\w*|dorm\w*|halls of residence|living costs?|where (?:will|would) i live)\b/i],
  ["fees", /\b(?:fee|fees|tuition|costs?|price\w*|how much|instal\w*|deposit\w*|refund\w*|scholarship money)\b/i],
  ["visa", /\b(?:visa\w*|immigration|work permit|study permit|embassy|sponsorship|sponsor)\b/i],
  ["application", /\b(?:apply|applying|application\w*|deadline\w*|intake\w*|enrol\w*|enroll\w*|admission\w*|offer letter|documents?)\b/i],
  ["eligibility", /\b(?:eligib\w*|qualify|qualifies|qualified|requirement\w*|entry|ielts|toefl|pte|gpa|grade\w*|backlog\w*|prerequisite\w*)\b/i],
  ["contact", /\b(?:contact|speak to|talk to (?:a|someone)|call me|email me|counsell?or\w*|advisor\w*|human)\b/i],
  ["course", /\b(?:course\w*|program\w*|degree\w*|master\w*|bachelor\w*|diploma\w*|mba|msc|study|studying|subject\w*|major\w*|specialisation|specialization)\b/i],
];

/** One message → one label. "other" when nothing matches, which is a real answer, not a failure. */
export function topicOf(text: string): Topic {
  for (const [topic, re] of RULES) if (re.test(text)) return topic;
  return "other";
}

/**
 * The visitor's own messages as a journey.
 *
 * Only the VISITOR's turns: the counsellor's reply mentions fees, intakes and eligibility in
 * almost every answer, so labelling its text would make every conversation look identical.
 *
 * Consecutive repeats collapse — three messages about fees are one step through "fees", not
 * three — because the sequence is meant to show the shape of the journey, and
 * `["fees","fees","fees"]` says nothing `["fees"]` does not.
 */
export function topicSequence(turns: ReadonlyArray<{ role: string; content: string }>): Topic[] {
  const out: Topic[] = [];
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const matched = topicOf(turn.content);
    // A keyword-less follow-up continues the subject it follows. "is that per year or total?"
    // carries no keyword of its own but is plainly still the fees question, and labelling it
    // "other" put a hole in the middle of every real path. Chatter inherits too ("thanks" after
    // fees reads as fees), which costs nothing: the dedupe below collapses it away.
    const topic = matched === "other" ? out[out.length - 1] ?? "other" : matched;
    if (out[out.length - 1] !== topic) out.push(topic);
  }
  return out;
}

// ── Pattern mining (Phase 5) ─────────────────────────────────────────────────

/**
 * Each label as it reads inside a sentence. Backend-side because the vocabulary is defined here:
 * a label the portal can render but the guidance sentence cannot name would be a split source.
 */
const PHRASE: Record<Topic, string> = {
  course: "courses",
  eligibility: "whether they qualify",
  fees: "fees",
  scholarship: "scholarships",
  application: "applying",
  visa: "visas",
  accommodation: "accommodation",
  contact: "speaking to someone",
  other: "something else",
};

/**
 * A mined transition as a sentence an institution can store as a memory.
 *
 * Phrased as guidance about SEQUENCE — "raise B while A is on the table" — and never as a fact,
 * because a COUNSELLING_GUIDELINE may not state one. The transition is evidence about what
 * visitors here do next; it says nothing about fees or scholarships themselves.
 *
 * `from` and `to` are always different: topicSequence collapses consecutive repeats, so no
 * conversation can produce a self-transition for this to describe.
 */
export function transitionGuidance(from: string, to: string): string {
  // Takes strings, not Topic: the labels come back out of a jsonb column, and a row written
  // before a label was renamed must still produce a readable sentence rather than "about
  // undefined" — this text is stored as a memory the counsellor will read out.
  const a = PHRASE[from as Topic] ?? from;
  const b = PHRASE[to as Topic] ?? to;
  return `Visitors who ask about ${a} often go on to ask about ${b}. `
    + `Bring ${b} up while ${a} is still being discussed, rather than waiting to be asked.`;
}
