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
  searchAll,
  withoutContactDetails,
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

async function main() {
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

  {
    // "show" is in AFFIRM_RE, so filtering it left ONE word and the count rule (> 1) borrowed the
    // previous question — an engineering request also searched nursing (Greptile). A command word
    // is not a subject: what matters is whether ANY subject word survives, not how many.
    const prior = "Would you like to see nursing courses in Melbourne?";
    const r = retrievalKeywords("show engineering", prior);
    assert(!r.fromPriorQuestion, "a one-subject reply keeps its own words", r.keywords);
    assert(!r.keywords.includes("nursing"), "the previous subject does not leak in", r.keywords);
    // Same shape, opposite answer: a month is not a subject, so it still borrows (pinned above).
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

    // "yes" borrows, but "yes, please" did NOT: two words that both survive extractKeywords read as
    // a subject of their own, so the turn searched for the literal words "yes please" and found no
    // courses — the counsellor then said the course it had just recommended was not in our system.
    for (const reply of ["yes, please", "yes please", "tell me more", "yes tell me more", "sure, show me"]) {
      const r = retrievalKeywords(reply, "Would you like more details on these programs?");
      assert(r.fromPriorQuestion, `"${reply}" answers the question it follows`, r.keywords);
    }
    // A reply that carries a subject of its own still keeps it.
    assert(!retrievalKeywords("yes, what about the fees and intakes", "Would you like more details?").fromPriorQuestion,
      "a reply with its own subject is not a bare yes");
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
    // The filler strip used to run ONLY on a level turn, so the commonest question a widget gets —
    // "What courses do you offer?" — searched for the literal words "courses offer", matched none of
    // the institution's 33 published courses, and was answered "I don't have the course listings in
    // our system". Empty is the right query here: searchCourses browses the catalogue.
    assertEqual(courseKeywordsFor(retrievalKeywords("What courses do you offer?", null).keywords, null), "",
      "a bare offer question browses rather than searching for the word 'offer'");
    assertEqual(courseKeywordsFor(retrievalKeywords("what programs do you have", null).keywords, null), "",
      "same for programs");
    assertEqual(courseKeywordsFor(retrievalKeywords("do you offer engineering courses", null).keywords, null),
      "engineering", "the subject still decides when there is one");
    // Same defect, one phrasing further out: how a visitor ASKS was never filtered, and the
    // opening message is almost always phrased that way. "tell"/"know" are not subjects, but they
    // reached the query and the STRICT pass needs every word in a course NAME — so a question with
    // a perfectly good subject in it matched nothing and fell to the loose OR, and a question with
    // no subject at all searched descriptions for '%know%' instead of browsing.
    const cq = (q: string) => courseKeywordsFor(retrievalKeywords(q, null).keywords, null);
    assertEqual(cq("can you tell me about studying nursing"), "nursing", "an asking verb never reaches the query");
    assertEqual(cq("tell me about data science"), "data science", "…and the subject survives intact");
    assertEqual(cq("hi, I want to know about your courses"), "", "a bare 'what do you have' browses, never searches '%know%'");
    assertEqual(cq("what options are available"), "", "same for options/available");
    assertEqual(cq("can you recommend a business course"), "business", "recommend/suggest are how they ask, not what they want");
    // The words deliberately left OUT of FILLER, because they name real courses. If either of
    // these ever reduces to "technology" or "machine", the filter has gone too far.
    assertEqual(cq("I want to study information technology"), "information technology", "'information' is a course name, not filler");
    assertEqual(cq("I want info on information technology"), "information technology", "'info' goes, 'information' stays");
    assertEqual(cq("I want to learn machine learning"), "machine learning", "'learning' survives even though 'learn' does not");

    // The borrowing test reads the visitor's own words for a SUBJECT, and it was reading them
    // with a different list than courseKeywordsFor uses. So a word could be a subject here
    // (suppressing the borrow) and filler there (stripped from the query) — leaving nothing at
    // all, which browses unrelated courses. "details" answering a question about a nursing
    // diploma is the case Greptile caught; "I'm interested" had the same shape before that.
    const diplomaQ = "Would you like details about our nursing diploma?";
    const after = (reply: string) => {
      const k = retrievalKeywords(reply, diplomaQ);
      return { borrowed: k.fromPriorQuestion, query: courseKeywordsFor(k.keywords, detectDegreeLevel(resolveQuery(reply, diplomaQ))) };
    };
    for (const reply of ["details", "tell me more", "options", "I am interested", "more info please"]) {
      assertEqual(after(reply).borrowed, true, `"${reply}" has no subject of its own, so it borrows`);
      assertEqual(after(reply).query, "nursing", `"${reply}" keeps the counsellor's subject`);
    }
    // …and the level comes with it, or a diploma request browses every nursing course there is.
    assertEqual(detectDegreeLevel(resolveQuery("details", diplomaQ)), "Diploma", "the borrowed question carries its level");

    // The other direction, which is why FOLLOW_UP and CATALOGUE are separate sets: asking what
    // EXISTS is a broad new question, not a request to continue. Borrowing here would narrow it
    // back to whatever was last discussed — the opposite of what was asked.
    assertEqual(after("what courses do you offer?").borrowed, false, "a catalogue question is its own subject");
    assertEqual(after("what courses do you offer?").query, "", "…and still browses");
    // One catalogue word and nothing else — "offer" is not there to carry it, so this is the
    // phrasing that actually pins CATALOGUE as separate from FOLLOW_UP.
    assertEqual(after("what courses do you have").borrowed, false, "one catalogue word is still a subject");
    assertEqual(after("what courses do you have").query, "", "…and browses rather than borrowing nursing");
    assertEqual(after("engineering").borrowed, false, "a real subject never borrows");
    assertEqual(after("engineering").query, "engineering", "…and is searched as itself");
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

  console.log("\nwithoutContactDetails — a widget reply hands out no way to contact anybody");
{
  const red = (t: string) => withoutContactDetails(t);
  // A crawled site brings its own staff directory, and the model cannot tell a department inbox
  // from someone's desk line — so neither is allowed through.
  assert(!red("Write to j.smith@ait.ac.th for details").includes("@ait.ac.th"), "a personal email goes");
  assert(!red("Email admissions@ait.ac.th").includes("admissions@"), "and so does the department inbox");
  assert(!red("Call +66 2 524 5032 to apply").includes("5032"), "an international number goes");
  assert(!red("Tel: 02 524 5032").includes("5032"), "so does a labelled local one");
  // The money guard depends on fees surviving the redactor verbatim: over-redaction here would
  // silently delete the figure the answer is about.
  assertEqual(red("Tuition is THB 950,000 total"), "Tuition is THB 950,000 total", "a fee is not a phone number");
  assertEqual(red("1 200 000 THB per year"), "1 200 000 THB per year", "nor is a spaced-out figure");
  assertEqual(red("Applications close 2026-10-08"), "Applications close 2026-10-08", "nor is a date");
  assertEqual(red("IELTS 6.5 with 6.0 in writing"), "IELTS 6.5 with 6.0 in writing", "nor a test score");
  // A postal address is a contact route too (owner decision, 2026-10-08) — the prompt rule alone
  // left it to the model, with the street still sitting in the context window (Greptile).
  assert(!red("Visit us at 123 College Road, Pathumthani").includes("College Road"), "a street address goes");
  assert(red("Visit us at 123 College Road, Pathumthani").includes("Pathumthani"), "but the city stays — a place is not a contact route");
  assert(!red("Level 6, 579 Harris St, Ultimo").includes("579"), "a unit-and-number address goes");
  assert(!red("58 Moo 9, km. 42 Paholyothin Road, Klong Luang").includes("Paholyothin"), "and a long one");
  assert(!red("P.O. Box 4, Klong Luang").includes("Box 4"), "so does a PO box");
  assertEqual(red("Tuition is 950,000 THB at the Bangkok campus"), "Tuition is 950,000 THB at the Bangkok campus",
    "a fee followed by a place is not an address");
  // …and the same sentence where the campus is STREET-named, which is the case that actually bit
  // (Greptile P1): the span reached from the figure all the way to "Street" and masked the fee the
  // answer was about. The "950,000" lookahead does not save these — it only moves the anchor past
  // the comma or the decimal point, so the figure came back mangled rather than merely deleted.
  assertEqual(red("Tuition is 4000 per semester at King Street campus"),
    "Tuition is 4000 per semester at King Street campus", "a fee is not eaten by a street-named campus");
  assertEqual(red("Tuition is AUD 24,500 per year at our Oxford Street campus."),
    "Tuition is AUD 24,500 per year at our Oxford Street campus.", "…nor is a comma-grouped one re-anchored after the comma");
  assertEqual(red("IELTS 6.5 overall required for the Collins Street intake"),
    "IELTS 6.5 overall required for the Collins Street intake", "…nor a score re-anchored after the decimal point");
  assertEqual(red("A 5000 scholarship is offered at the George Street campus"),
    "A 5000 scholarship is offered at the George Street campus", "…nor a scholarship figure");
  // The redaction still has to work, and on the shapes a real address takes: a name with an
  // apostrophe, and two name words before the street word.
  assert(!red("45 A'Beckett Street, Melbourne").includes("Beckett"), "an apostrophe in the street name is still an address");
  assert(!red("150 Great Portland Street, London").includes("Portland"), "and so are two name words");
  assert(red("150 Great Portland Street, London").includes("London"), "the city still survives either way");
}

console.log("\nsearchAll.searched — empty context has two causes and the prompt needs them apart");
{
  // These inputs MUST be ones searchAll refuses before its first query — the early return is what
  // keeps this file off the database. "thanks, that's all" is NOT one of them: CLOSING_RE is
  // anchored and the comma breaks it, so that string runs the full ten-way search and this block
  // would quietly start asserting against whatever the dev DB happens to hold.
  const bye = await searchAll({ query: "thanks", userId: 0 });
  assertEqual(bye.searched, false, "a closing reply never searched");
  assertEqual(bye.contextText, "", "…and has no context either");
  assertEqual((await searchAll({ query: "ok", userId: 0 })).searched, false, "nor does a bare acknowledgement");
  assertEqual((await searchAll({ query: "bye", userId: 0 })).searched, false, "nor a goodbye");
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

void main();
