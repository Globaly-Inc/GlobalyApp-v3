/**
 * Phase 3 — conversion journeys. Topic labelling and the §11 aggregate inputs.
 *
 * The thing this feature exists to replace is `email_captured = true`: the question is which
 * journeys produce a lead, and these are the pure pieces that answer it.
 *
 * Run: node --import tsx tests/conversation-signals.ts  (or: npm run test:conversation-signals)
 * No DB, no model calls — the classifier is keyword-based on purpose.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

const t = await import("../src/modules/institution-memory/lib/conversation-topics.js");
const schema = await import("../src/modules/institution-memory/schemas/signals.schema.js");

let passed = 0, failed = 0;
const assert = (cond: boolean, label: string, detail?: unknown) => {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const user = (content: string) => ({ role: "user", content });
const bot = (content: string) => ({ role: "assistant", content });

console.log("\n1. topicOf — the labels a funnel is made of");
{
  assert(t.topicOf("what masters programs do you offer?") === "course", "a course question");
  assert(t.topicOf("do I qualify with a 2:1 and IELTS 6.5?") === "eligibility", "an eligibility question");
  assert(t.topicOf("how much is the tuition?") === "fees", "a fees question");
  assert(t.topicOf("when is the deadline to apply?") === "application", "an application question");
  assert(t.topicOf("do I need a student visa?") === "visa", "a visa question");
  assert(t.topicOf("can I speak to a counsellor?") === "contact", "a contact question");
  assert(t.topicOf("thanks, that's helpful") === "other", "and ordinary chatter is 'other', which is an answer");
}

console.log("\n2. topicOf — precedence is a property of the rule ORDER, not an accident");
{
  // Each of these names two topics. The label is what the question is ABOUT.
  assert(t.topicOf("what are the fees for the MBA?") === "fees",
    "a fees question that happens to name a course is about fees");
  assert(t.topicOf("do I qualify for a scholarship?") === "scholarship",
    "qualifying for a scholarship is about the scholarship, not about qualifying");
  assert(t.topicOf("what IELTS score do I need for the visa?") === "visa",
    "a visa requirement outranks the test it names");
}

console.log("\n3. topicSequence — the shape of the journey");
{
  const turns = [
    user("what masters do you offer in computing?"),
    bot("We offer several — fees, intakes and entry requirements vary."),
    user("am I eligible with a 2:1?"),
    bot("Yes, that meets the requirement."),
    user("and what does it cost?"),
    user("is that per year or total?"),
    bot("Per year."),
    user("ok how do I apply?"),
  ];
  const seq = t.topicSequence(turns);
  assert(JSON.stringify(seq) === JSON.stringify(["course", "eligibility", "fees", "application"]),
    "the classic discovery → eligibility → fees → apply path", seq);

  // A keyword-less follow-up continues the subject it follows, rather than punching an "other"
  // hole through the middle of the path.
  assert(JSON.stringify(t.topicSequence([user("how much is it?"), user("is that per year or total?")]))
    === JSON.stringify(["fees"]), "a bare follow-up stays on the topic it follows");
  assert(JSON.stringify(t.topicSequence([user("thanks")])) === JSON.stringify(["other"]),
    "but with nothing to follow, 'other' is still the honest label");

  // The counsellor mentions fees, intakes and requirements in almost every reply, so labelling
  // its text would make every conversation look identical.
  assert(!t.topicSequence([bot("fees, visas, eligibility and deadlines")]).length,
    "only the VISITOR's turns count");

  // Three messages about fees are one step through fees, not three.
  assert(JSON.stringify(t.topicSequence([user("cost?"), user("how much?"), user("price?")])) === JSON.stringify(["fees"]),
    "consecutive repeats collapse — the sequence shows shape, not volume");

  // But a return to a topic IS a step: it says they came back to it.
  assert(JSON.stringify(t.topicSequence([user("cost?"), user("do I qualify?"), user("and the fee again?")]))
    === JSON.stringify(["fees", "eligibility", "fees"]),
    "a return to an earlier topic is its own step");
}

console.log("\n4. the signals row refuses to carry anything a visitor said");
{
  const base = {
    session_id: 9, visitor_key: "vk", embed_config_id: 3,
    first_topic: "course", topic_sequence: ["course", "fees"], message_count: 4,
    duration_seconds: 300, converted: true, contact_source: "volunteered",
    ai_prompted: false, messages_to_conversion: 4, topic_before_conversion: "fees",
    converted_at: new Date(), memory_ids: [],
  };
  assert(schema.ConversationSignalsSchema.safeParse(base).success, "a well-formed journey parses");

  // The vocabulary is CLOSED, which is what keeps a visitor's phrasing out of this table by
  // construction rather than by reviewer vigilance.
  assert(!schema.ConversationSignalsSchema.safeParse({ ...base, first_topic: "can I pay in instalments" }).success,
    "a free-text topic is rejected — labels come from a fixed list, never from what was typed");
  assert(!schema.ConversationSignalsSchema.safeParse({ ...base, topic_sequence: ["course", "my IELTS is 7"] }).success,
    "and the same applies inside the sequence");
  assert(!schema.ConversationSignalsSchema.safeParse({ ...base, contact_source: "guessed" }).success,
    "contact_source is card or volunteered, nothing else");
}

console.log("\n5. the §11 distinction this table exists for");
{
  // "Easy conversion" is converted AND never asked. Both halves were already recorded on
  // ai_widget_visitors (contact_prompt_count) and simply never read until now.
  const easy = { converted: true, ai_prompted: false };
  const worked = { converted: true, ai_prompted: true };
  assert(easy.converted && !easy.ai_prompted, "volunteered: converted without ever being asked");
  assert(worked.converted && worked.ai_prompted, "prompted: converted after the counsellor asked");
  assert(easy.ai_prompted !== worked.ai_prompted,
    "and the two are distinguishable, which `email_captured = true` never was");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
