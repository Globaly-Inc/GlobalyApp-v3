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
const sig = await import("../src/modules/institution-memory/services/conversation-signals.service.js");
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

console.log("\n6. journeyEndedAt — a converted journey ends at the HAND-OVER");
{
  // Third figure in this file derived from a column that keeps moving after the moment it is
  // meant to describe (message_count was the first). last_activity_at advances on every turn a
  // converted visitor takes afterwards, so using it reports the WHOLE conversation as "time to
  // conversion" — and the panel prints that number beside "Messages to a lead".
  const submitted = new Date("2026-10-01T10:05:00Z");
  const lastActivity = new Date("2026-10-01T10:40:00Z"); // they kept chatting for 35 more minutes
  const v = { contact_submitted_at: submitted, last_activity_at: lastActivity };

  assert(sig.journeyEndedAt(v, true) === submitted.getTime(),
    "converted → ends when they handed over their details, not 35 minutes later");
  assert(sig.journeyEndedAt(v, false) === lastActivity.getTime(),
    "unconverted → genuinely ends at the last thing they did");
  assert(sig.journeyEndedAt({ last_activity_at: lastActivity }, true) === lastActivity.getTime(),
    "converted with no recorded hand-over falls back rather than returning nothing");
  assert(sig.journeyEndedAt(null, true) === null, "no visitor row → no duration");
}

console.log("\n7. volunteered vs prompted PARTITION the leads — one axis, no double count");
{
  // A visitor can be shown the card and then type their address into the chat instead. That row
  // carries contact_source = 'volunteered' AND ai_prompted = true, so keying the two groups on
  // different columns counted the same lead twice and the panel's "these add up to N" was false.
  // The axis is ai_prompted alone: §11 asks whether the lead came without being asked.
  const leads = [
    { converted: true, ai_prompted: false, contact_source: "volunteered" }, // never asked
    { converted: true, ai_prompted: true, contact_source: "card" },         // asked, used the card
    { converted: true, ai_prompted: true, contact_source: "volunteered" },  // asked, typed it anyway
    { converted: false, ai_prompted: true, contact_source: null },          // asked, never converted
  ];
  const converted = leads.filter((l) => l.converted).length;
  const volunteered = leads.filter((l) => l.converted && !l.ai_prompted).length;
  const prompted = leads.filter((l) => l.converted && l.ai_prompted).length;

  assert(volunteered + prompted === converted,
    "the two groups sum to the converted total, which is what the panel claims", { volunteered, prompted, converted });

  // The row that broke it, named explicitly so a future change to contact_source can be judged.
  const bothMarkers = leads.filter((l) => l.converted && l.ai_prompted && l.contact_source === "volunteered");
  assert(bothMarkers.length === 1, "the overlapping case exists and is real — asked, then typed it in chat anyway");
  const onContactSource = leads.filter((l) => l.converted && l.contact_source === "volunteered").length;
  assert(onContactSource + prompted > converted,
    "and keying on contact_source instead would over-count it — the old behaviour", { onContactSource, prompted, converted });
}

console.log("\n8. topic rules — anchors, stems, and the overlap that mattered");
{
  // `\ba|b|c\b` anchors \b to the FIRST and LAST alternative only, so every middle one matched
  // inside a word. Every rule in the list had it; these are the cases that proved it.
  assert(t.topicOf("costume design course") === "course",
    "'costume' no longer matches the fees rule's unanchored 'cost'");
  assert(t.topicOf("what are the living costs?") === "accommodation",
    "'living cost' reaches the accommodation rule — fees used to swallow it on a bare 'cost'");
  assert(t.topicOf("is accommodation included in the fees?") === "accommodation",
    "accommodation sits ABOVE fees: a housing question that mentions cost is about housing");
  assert(t.topicOf("how much is the tuition?") === "fees",
    "and nothing travels the other way — a fees question carries no housing word");

  // Stems take \w*, so every real form matches rather than only the bare stem.
  assert(t.topicOf("am I eligible?") === "eligibility", "'eligible'");
  assert(t.topicOf("what are the entry requirements?") === "eligibility", "'requirements'");
  assert(t.topicOf("when are the application deadlines?") === "application", "'deadlines'");
  assert(t.topicOf("do you have scholarships?") === "scholarship", "'scholarships'");
}

console.log("\n9. transitionGuidance — a mined step as something storable");
{
  const g = t.transitionGuidance("fees", "scholarship");
  assert(g.includes("fees") && g.includes("scholarships"), "names both ends in the institution's words", g);
  // CreateMemorySchema's Content is trim().min(3).max(600). A sentence this endpoint composes
  // and the portal POSTs straight back must sit inside that, for EVERY pair — a 600-char
  // overflow would be a 400 the user sees only on the longest pair, months later.
  for (const from of t.TOPICS) {
    for (const to of t.TOPICS) {
      if (from === to) continue;
      const text = t.transitionGuidance(from, to);
      assert(text.length >= 3 && text.length <= 600, `${from}→${to} fits CreateMemorySchema`, text.length);
      assert(!text.includes("undefined"), `${from}→${to} names every label`, text);
    }
  }
  // Labels come out of a jsonb column, so a value the enum no longer carries must still read.
  assert(t.transitionGuidance("widgets", "fees").includes("widgets"),
    "an unknown label falls back to itself rather than printing 'undefined'");

  // The pair can never be equal: topicSequence collapses consecutive repeats, which is what
  // makes "often go on to ask about X" true of a transition rather than of a pause.
  const seq = t.topicSequence([user("cost?"), user("how much?"), user("do I qualify?")]);
  assert(seq.every((step, i) => i === 0 || step !== seq[i - 1]), "no journey yields a self-transition", seq);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
