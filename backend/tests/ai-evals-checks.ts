/**
 * Eval-harness test — asserts the SSE frame parser folds a real stream into a turn,
 * and that each structural check fires on the reply shape it is meant to catch.
 * Run: node --import tsx tests/ai-evals-checks.ts  (or: npm run test:ai-evals-checks)
 *
 * This exists because a check that silently never matches makes the whole harness
 * useless — every question would pass and nobody would know. Cheap insurance for
 * eleven regexes.
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

import { readFileSync } from "node:fs";
import { CHECKS, applyFrame, emptyTurn, type Turn } from "../scripts/ai-evals/run-evals.js";

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

/** A turn with the given reply text and nothing else. */
const reply = (text: string): Turn => ({ ...emptyTurn(), text });

// ── 1. Frame parsing over a stream shaped like the real endpoint ──
{
  const stream = [
    `event: session\ndata: {"id":41,"isNew":true}`,
    `event: trace\ndata: {"step":"Searching knowledge base…"}`,
    `event: trace\ndata: {"step":"Searched knowledge base: visa — 4 passages"}`,
    `data: {"choices":[{"delta":{"content":"You will "}}]}`,
    `data: {"choices":[{"delta":{"content":"need about GBP 1,483 per month."}}]}`,
    `event: sources\ndata: [{"type":"document","id":"d1","title":"Home Office"}]`,
    `event: cards\ndata: [{"id":"c1","name":"MSc Data Science"}]`,
    `event: blocks\ndata: [{"type":"quick_replies"}]`,
    `event: chips\ndata: ["What about work rights?"]`,
    `event: usage\ndata: {"totalTokens":900}`,
    `event: done\ndata: {"message_id":7,"session_id":41}`,
    `data: [DONE]`,
  ];

  const turn = emptyTurn();
  for (const frame of stream) applyFrame(turn, frame);

  assertEqual(turn.sessionId, 41, "the session id is captured");
  assertEqual(turn.text, "You will need about GBP 1,483 per month.", "deltas accumulate in order");
  assertEqual(turn.traces.length, 2, "trace steps are collected");
  assertEqual(turn.sources.length, 1, "sources are collected");
  assertEqual(turn.cards.length, 1, "cards are collected");
  assertEqual(turn.blocks.length, 1, "blocks are collected");
  assertEqual(turn.chips.length, 1, "chips are collected");
  assertEqual(turn.error, null, "no error on a clean stream");
}

// ── 2. Malformed and unknown frames are survived, not thrown on ──
{
  const turn = emptyTurn();
  applyFrame(turn, "data: not-json");
  applyFrame(turn, "event: something-new\ndata: {}");
  applyFrame(turn, "");
  applyFrame(turn, `data: {"choices":[]}`);
  assertEqual(turn.text, "", "junk frames contribute nothing");
  assertEqual(turn.error, null, "junk frames are not treated as errors");

  const errored = emptyTurn();
  applyFrame(errored, `event: error\ndata: {"error":"Gemini stream failed"}`);
  assertEqual(errored.error, "Gemini stream failed", "an error event is captured");
}

// ── 3. Each check fires on the shape it is supposed to catch, and not otherwise ──
{
  assert(CHECKS.asks_question!(reply("What draws you to data science?")),
    "asks_question sees a question");
  assert(!CHECKS.asks_question!(reply("Here are three options for you.")),
    "asks_question is false for a plain statement");
  assert(CHECKS.asks_question!({ ...emptyTurn(), text: "Pick one.", blocks: [{ type: "quick_replies" }] }),
    "asks_question accepts a quick_replies block");

  assert(CHECKS.hedged!(reply("This appears to meet the requirement, but check with the institution.")),
    "hedged sees hedging language");
  assert(!CHECKS.hedged!(reply("You will get in and your visa will be approved.")),
    "hedged is false for a guarantee");

  assert(CHECKS.no_diagnosis!(reply("That sounds exhausting — it's worth talking to someone who can help.")),
    "no_diagnosis passes an empathetic reply");
  assert(!CHECKS.no_diagnosis!(reply("It sounds like you have anxiety.")),
    "no_diagnosis catches a clinical claim");
  assert(!CHECKS.no_diagnosis!(reply("I can't diagnose you, but you are clinically burnt out.")),
    "no_diagnosis catches a diagnosis behind a disclaimer");

  assert(CHECKS.admits_gap!(reply("I don't have that specific information in our system right now.")),
    "admits_gap sees an honest gap");
  assert(!CHECKS.admits_gap!(reply("The fee is EUR 12,400 per year.")),
    "admits_gap is false when a figure is asserted");

  assert(CHECKS.mentions_alternative!(reply("Toronto is cheaper, whereas Melbourne has a longer post-study visa.")),
    "mentions_alternative sees a trade-off");
  assert(!CHECKS.mentions_alternative!(reply("Melbourne is the best choice for you.")),
    "mentions_alternative is false for a single option");

  assert(!CHECKS.no_reask_budget!(reply("Great — what is your budget?")),
    "no_reask_budget catches a re-ask");
  assert(CHECKS.no_reask_budget!(reply("With your AUD 30,000 budget, here is what stands out.")),
    "no_reask_budget passes when the budget is used, not re-asked");

  assert(CHECKS.no_card!(emptyTurn()), "no_card passes with no cards");
  assert(!CHECKS.no_card!({ ...emptyTurn(), cards: [{}] }), "no_card fails when a card was emitted");
  assert(CHECKS.cites!({ ...emptyTurn(), sources: [{}] }), "cites passes when a source arrived");
  assert(!CHECKS.cites!(emptyTurn()), "cites fails with no sources");
}

// ── 4. Every check named in questions.json actually exists ──
{
  const set = JSON.parse(
    readFileSync(new URL("../scripts/ai-evals/questions.json", import.meta.url), "utf-8"),
  ) as { checks: Record<string, string>; questions: Array<{ id: string; expect: string[] }> };

  const named = new Set(Object.keys(set.checks));
  const used = new Set(set.questions.flatMap((q) => q.expect));

  const missing = [...used].filter((name) => !CHECKS[name]);
  assertEqual(missing.length, 0, "every expected check is implemented", missing);

  const undocumented = [...used].filter((name) => !named.has(name));
  assertEqual(undocumented.length, 0, "every expected check is documented in questions.json", undocumented);

  const unused = [...named].filter((name) => !used.has(name));
  assertEqual(unused.length, 0, "no documented check goes unused by any question", unused);

  const ids = set.questions.map((q) => q.id);
  assertEqual(new Set(ids).size, ids.length, "question ids are unique");
  assert(set.questions.length >= 25, "the set is large enough to be worth diffing", set.questions.length);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
