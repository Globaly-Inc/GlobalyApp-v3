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
  isCourtesyTurn, lastAssistantQuestion, retrievalKeywords,
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
