/**
 * retrievalKeywords() / isCourtesyTurn() / lastAssistantQuestion() — what the widget
 * actually searches for on a given turn.
 * Run: node --import tsx tests/widget-retrieval-query.ts
 *
 * Style matches tests/rack-chunk-budget.ts: plain tsx script, manual counters, no framework.
 * Pure functions, so no mocks, no DB and no API key are needed.
 *
 * The two cases that matter, both caused by extractKeywords keeping every word over two
 * letters that isn't a stopword:
 * - a goodbye cost a ten-way search plus a rack embedding to answer one word;
 * - "yes" to "shall I show you Melbourne courses?" searched for the word "yes", matched
 *   nothing, and left the counsellor with no courses to show.
 */

import {
  courseKeywordsFor, detectDegreeLevel, isCourtesyTurn, lastAssistantQuestion, resolveQuery, retrievalKeywords,
} from "../src/modules/ai-counsellor/services/rag.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const assertEqual = (actual: unknown, expected: unknown, label: string) =>
  assert(actual === expected, label, { actual, expected });

const msg = (role: string, content: string) => ({ role, content });

function main() {
  const question = "Would you like to see nursing courses in Melbourne?";

  console.log("\nisCourtesyTurn — turns that ask for nothing");
  {
    // Closers end the conversation whether or not the counsellor just asked something.
    for (const text of ["thanks", "Thanks!", "thank you", "no thanks", "bye", "that's all", "cheers"]) {
      assert(isCourtesyTurn(text), `"${text}" asks for nothing`);
      assert(isCourtesyTurn(text, question), `"${text}" still asks for nothing after a question`);
    }
    // Acknowledgements are closers only when nothing was asked. After the counsellor's own
    // question they are the student saying yes, and yes must fetch what was offered.
    for (const text of ["ok", "Okay.", "sure", "yep", "perfect", "great"]) {
      assert(isCourtesyTurn(text), `"${text}" alone asks for nothing`);
      assert(!isCourtesyTurn(text, question), `"${text}" answering a question is a yes, not a goodbye`);
    }
    // Each of these carries a real question or subject; searching is the whole point of them.
    for (const text of ["thanks, what are the fees?", "ok but when does it start", "no", "yes", "September"]) {
      assert(!isCourtesyTurn(text), `"${text}" is not courtesy`);
    }
  }

  console.log("\nretrievalKeywords — an acknowledgement answering a question is a yes");
  {
    const { keywords, fromPriorQuestion } = retrievalKeywords("sure", question);
    assert(fromPriorQuestion, '"sure" after an offer fetches what was offered');
    assert(keywords.includes("nursing") && keywords.includes("melbourne"), "searches nursing courses in Melbourne", keywords);
  }

  console.log("\nretrievalKeywords — a courtesy turn searches nothing");
  {
    const { keywords } = retrievalKeywords("thanks!", "Would you like to see nursing courses in Melbourne?");
    assertEqual(keywords.length, 0, "a goodbye searches nothing, even mid-conversation");
  }

  console.log("\nretrievalKeywords — a short reply searches the question it answers");
  {
    const { keywords, fromPriorQuestion } = retrievalKeywords(
      "yes", "Would you like to see nursing courses in Melbourne?",
    );
    assert(fromPriorQuestion, "the reply borrows its subject from the question");
    assert(keywords.includes("nursing") && keywords.includes("melbourne"), "searches nursing courses in Melbourne", keywords);
  }
  {
    // A one-word answer that IS a search term keeps its own word as well as the subject.
    const { keywords } = retrievalKeywords("September", "Which intake are you aiming for on the nursing diploma?");
    assert(keywords.includes("september") && keywords.includes("nursing"), "keeps both the answer and its subject", keywords);
  }

  console.log("\nretrievalKeywords — a reply that only points at what is on screen borrows too");
  {
    const prior = "Would you like to see nursing courses in Melbourne?";
    // "ok" is one syllable shorter than "okay" and extractKeywords drops it entirely (<= 2 letters),
    // so it used to leave the turn with nothing at all to search (Greptile).
    const bare = retrievalKeywords("ok", prior);
    assert(bare.fromPriorQuestion, "an acknowledgement with no surviving keyword still borrows");
    assert(bare.keywords.includes("nursing"), "'ok' searches what was offered", bare.keywords);
    // Two words survive here, which used to look like a subject of its own — but both only point
    // back at the list the counsellor just showed.
    const pick = retrievalKeywords("the second one", prior);
    assert(pick.fromPriorQuestion, "a selection borrows the question it answers");
    assert(pick.keywords.includes("nursing"), "'the second one' searches the offered courses", pick.keywords);
    assert(!retrievalKeywords("ok", null).keywords.length, "an acknowledgement with nothing to borrow searches nothing");
    // A closing turn is still a closing turn, however much context is available to borrow.
    assert(!retrievalKeywords("thanks!", prior).keywords.length, "a goodbye never borrows");
  }

  console.log("\nretrievalKeywords — a real question searches its own words");
  {
    const prior = "Would you like to see nursing courses in Melbourne?";
    const { keywords, fromPriorQuestion } = retrievalKeywords("what are the tuition fees in Sydney?", prior);
    assert(!fromPriorQuestion, "a question with its own subject never borrows");
    assert(keywords.includes("sydney") && keywords.includes("tuition"), "searches what was asked", keywords);
    assert(!keywords.includes("melbourne"), "the previous turn's city does not leak in", keywords);
  }
  {
    // No prior question (the counsellor's last turn was a statement): nothing to borrow.
    const { keywords, fromPriorQuestion } = retrievalKeywords("yes", null);
    assert(!fromPriorQuestion, "nothing to borrow when the counsellor asked nothing");
    assertEqual(keywords.join(" "), "yes", "falls back to the student's own words");
  }

  console.log("\ndetectDegreeLevel — a level is a filter, not a keyword");
  {
    // The turn that reported this: an institution with twelve published master's courses answered
    // "I don't have the specific list", because "masters" matches no course NAME (they read MSc,
    // MEng, MBA) and ILIKE '%masters%' cannot reach the stored "Master's" either.
    const asked = "I am looking for a Master's degree";
    assertEqual(detectDegreeLevel(asked), "Master", "a master's turn filters to Master");
    const { keywords } = retrievalKeywords(asked, null);
    assertEqual(courseKeywordsFor(keywords, "Master"), "",
      "nothing is left to keyword-match, so the level is browsed");
    // Prefixes, because searchCourses matches degree_level with ILIKE: "Master" hits "Master's".
    assertEqual(detectDegreeLevel("do you have a PhD"), "Doctoral", "PhD");
    assertEqual(detectDegreeLevel("is there an MBA"), "Master", "MBA is a master's");
    assertEqual(detectDegreeLevel("bachelor of nursing"), "Bachelor", "bachelor");
    assertEqual(detectDegreeLevel("water engineering"), null, "a subject turn has no level");
    // "postgraduate" means master's AND doctoral — narrowing it to one would hide the other.
    assertEqual(detectDegreeLevel("postgraduate options"), null, "postgraduate stays unfiltered");
    // A certificate is not a diploma: lumping them together filtered certificate requests to the
    // 151 diplomas and hid all 213 certificates.
    assertEqual(detectDegreeLevel("a certificate course"), "Certificate", "certificate is its own level");
    assertEqual(detectDegreeLevel("graduate diploma"), "Diploma", "diploma stays diploma");
    assertEqual(detectDegreeLevel("any doctorate programs"), "Doctoral", "doctorate is doctoral");
    // A level the visitor says they ALREADY HOLD is not the level they are asking for. List order,
    // not the sentence, used to decide: "bachelor" is tested before "diploma", so this filtered to
    // Bachelor and excluded every nursing diploma on offer.
    assertEqual(detectDegreeLevel("I have a bachelor's degree and want a diploma in nursing"), "Diploma",
      "the requested level wins over the held one");
    assertEqual(detectDegreeLevel("I have a bachelor in nursing, do you have master's programs"), "Master",
      "held clause ends at the comma");
    assertEqual(detectDegreeLevel("I've completed a diploma, looking for a bachelor now"), "Bachelor",
      "however the visitor words what they hold");
    // The plural matched no level at all, so this one asked for diplomas and got an unfiltered search.
    assertEqual(detectDegreeLevel("my degree is a bachelor of arts, do you have diplomas"), "Diploma",
      "plural diplomas is still a diploma");
    // What the visitor is DOING is not what they want to study — every word has to hit a course name.
    assertEqual(courseKeywordsFor(["want", "nursing"], "Diploma"), "nursing", "intent verbs never reach the query");
    // Single-intent turns are untouched: there is no held clause to lift out.
    assertEqual(detectDegreeLevel("I have been looking for a diploma"), "Diploma", "'I have been' is not holding one");
    // Only a held level and nothing asked for: that is still the level this turn is about.
    assertEqual(detectDegreeLevel("I have a diploma"), "Diploma", "a lone held level still filters");
    // A subject alongside the level still discriminates; only the level and filler words go.
    assertEqual(courseKeywordsFor(["masters", "engineering"], "Master"), "engineering",
      "the subject survives the level lift");
    assertEqual(courseKeywordsFor(["looking", "courses", "nursing"], "Master"), "nursing",
      "filler words never reach the query");
    // With no level detected the keywords are passed through exactly as before.
    assertEqual(courseKeywordsFor(["water", "engineering"], null), "water engineering",
      "no level, no change");
    // An MBA is a NAMED qualification, not a level: the degree_level column says "Master" for it,
    // so dropping the word left an empty query and browsed eight master's courses alphabetically
    // in place of the MBA that was asked for. It stays in the query; "masters" still goes.
    assertEqual(courseKeywordsFor(["mba"], "Master"), "mba", "mba names the qualification");
    assertEqual(courseKeywordsFor(["masters", "mba"], "Master"), "mba", "the level word still goes");
    assertEqual(courseKeywordsFor(["mba", "finance"], "Master"), "mba finance", "with its subject");
    assertEqual(courseKeywordsFor(["dba"], "Doctoral"), "dba", "same for a DBA");
    // The generic ones stay out — a course named "Master of Science in X" never says "msc", so
    // keeping it would turn a browsable level into zero results.
    assertEqual(courseKeywordsFor(["msc", "looking"], "Master"), "", "msc is still just the level");
    // "planning" is a SUBJECT (Master of Planning, financial planning) everywhere except the verb
    // "planning to", so the word cannot be filler — only the phrase can (Greptile).
    assertEqual(courseKeywordsFor(retrievalKeywords("masters in urban planning", null).keywords, "Master"),
      "urban planning", "planning names the subject");
    assertEqual(courseKeywordsFor(retrievalKeywords("I am planning to do a master's degree", null).keywords, "Master"),
      "", "the verb leaves the level to browse");
  }

  console.log("\nresolveQuery — what the semantic searches (rack, country, memory) see");
  {
    const refund = "Would you like me to explain our refund policy?";
    // The keyword searches already borrowed this; the rack embedding, country detection and
    // institution-memory search were still being handed the bare reply (Greptile).
    assert(resolveQuery("yes", refund).includes("refund"), "a yes carries the policy it agreed to", resolveQuery("yes", refund));
    assert(resolveQuery("yes", refund).includes("yes"), "the reply itself is kept too");
    const offer = "Would you like to see nursing courses in Melbourne?";
    assert(resolveQuery("the second one", offer).includes("nursing"), "a selection carries the subject");
    // A turn with its own subject is searched as the student wrote it — no prior-question leak.
    assertEqual(resolveQuery("what are the tuition fees in Sydney?", offer), "what are the tuition fees in Sydney?",
      "a real question is passed through untouched");
    assertEqual(resolveQuery("thanks!", offer), "thanks!", "a goodbye is not rewritten into a search");
    assertEqual(resolveQuery("yes", null), "yes", "nothing to resolve against");
  }

  console.log("\nlastAssistantQuestion — only the counsellor's newest turn, and only if it asked");
  {
    const thread = [
      msg("user", "hi"),
      msg("assistant", "Welcome! What would you like to study?"),
      msg("user", "nursing"),
      msg("assistant", "Would you like to see nursing courses in Melbourne?"),
    ];
    assertEqual(lastAssistantQuestion(thread), "Would you like to see nursing courses in Melbourne?", "the newest question");
    // Staff replies are the institution's side too — role is anything but "user".
    assertEqual(
      lastAssistantQuestion([...thread, msg("staff", "Which campus suits you best?")]),
      "Which campus suits you best?",
      "a staff reply counts as the counsellor's side",
    );
    assertEqual(
      lastAssistantQuestion([...thread, msg("assistant", "Here are three options.")]),
      null,
      "a statement is not a question to borrow from",
    );
    assertEqual(lastAssistantQuestion([msg("user", "hi")]), null, "no counsellor turn yet");
    assertEqual(lastAssistantQuestion([]), null, "empty thread");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
