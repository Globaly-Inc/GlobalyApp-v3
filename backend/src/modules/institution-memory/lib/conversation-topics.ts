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
 * "what are the fees for the MBA" is a fees question that happens to name a course, and
 * "do I qualify for a scholarship" is about the scholarship, not about qualifying.
 */
const RULES: ReadonlyArray<readonly [Topic, RegExp]> = [
  ["scholarship", /\bscholarship|bursar|financial aid|funding\b/i],
  ["fees", /\bfee|fees|tuition|cost|price|how much|instal|deposit|refund\b/i],
  ["visa", /\bvisa|immigration|work permit|study permit|embassy|sponsor(ship)?\b/i],
  ["accommodation", /\baccommodat|housing|hostel|dorm|where (will|would) i live|living cost\b/i],
  ["application", /\bapply|application|deadline|intake|enrol|enroll|admission|offer letter|documents?\b/i],
  ["eligibility", /\beligib|qualify|requirement|entry|ielts|toefl|pte|gpa|grade|backlog|prerequisite\b/i],
  ["contact", /\bcontact|speak to|talk to (a|someone)|call me|email me|counsell?or|advisor|human\b/i],
  ["course", /\bcourse|program|programme|degree|master|bachelor|diploma|mba|msc|study|subject|major\b/i],
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
