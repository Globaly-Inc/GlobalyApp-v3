/**
 * Money evidence must be matched to the topic ASKED, not to "is there money anywhere".
 * Pure — moneyTopicsOf / shouldWithholdMoney touch no DB and no network.
 * Run: npm run test:rag-money-topics
 *
 * Exists because `moneyData` was one boolean OR'd across courses, visas, guides, FAQs and
 * passages, so a retrieved course fee cleared the no-data guard for a refund-policy question
 * with no refund source anywhere in context (Greptile P1). Refund and scholarship have no
 * structured field in any source, so prose is the only thing that can ever ground them.
 */
import { moneyTopicsOf, askedMoneyTopics, shouldWithholdMoney, isMoneyQuestion, type MoneyTopic } from "../src/modules/ai-counsellor/services/rag.service.js";

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`); }
}

// ── The reported bug: a course fee must NOT ground a refund question ──
eq(shouldWithholdMoney("what is the refund policy if I withdraw?", ["fees"]), true,
   "refund question is NOT grounded by a course fee");
eq(shouldWithholdMoney("are there any scholarships available?", ["fees"]), true,
   "scholarship question is NOT grounded by a course fee");

// ── and the same question IS grounded by its own topic ──
eq(shouldWithholdMoney("what is the refund policy if I withdraw?", ["refund"]), false,
   "refund question grounded by refund prose");
eq(shouldWithholdMoney("are there any scholarships available?", ["scholarship"]), false,
   "scholarship question grounded by scholarship prose");
eq(shouldWithholdMoney("what are the tuition fees?", ["fees"]), false,
   "fees question grounded by a course fee");
eq(shouldWithholdMoney("how much is accommodation per month?", ["living"]), false,
   "living-cost question grounded by a country guide");

// ── overlap: either topic grounding it is enough, the model still only says what it holds ──
eq(shouldWithholdMoney("what are the fees and are there scholarships?", ["scholarship"]), false,
   "multi-topic question grounded by one of its topics");

// ── unchanged behaviour at the edges ──
eq(shouldWithholdMoney("what are the fees?", []), true, "money question, empty context");
eq(shouldWithholdMoney("tell me about the campus", []), false, "non-money question never withholds");
eq(shouldWithholdMoney("tell me about the campus", ["fees"]), false, "non-money question, money in context");

// ── classification itself ──
eq(moneyTopicsOf("what is the refund policy"), ["refund"] as MoneyTopic[], "classify: refund");
eq(moneyTopicsOf("scholarships and bursaries"), ["scholarship"] as MoneyTopic[], "classify: scholarship");
eq(moneyTopicsOf("cost of living"), ["fees", "living"] as MoneyTopic[], "classify: living (+fees via 'cost')");
eq(moneyTopicsOf("who teaches this course"), [] as MoneyTopic[], "classify: not money");
eq(isMoneyQuestion("what are the fees"), true, "isMoneyQuestion still true for money");
eq(isMoneyQuestion("where is the campus"), false, "isMoneyQuestion still false otherwise");

// ── False positives: a word that merely LOOKS like money must not gag the whole answer ──
// Observed live on the AIT widget: "compare two masters programs on fees, duration and intakes"
// came back as "we don't have that specific information", duration and intakes included. These
// are the asked-side classifications; the context side stays deliberately broad (below).
eq(askedMoneyTopics("do you offer a finance course?"), [] as MoneyTopic[],
  "false positive: finance as a SUBJECT is not a money question");
eq(askedMoneyTopics("tell me about your financial engineering masters"), [] as MoneyTopic[],
  "false positive: 'financial' in a program name");
eq(askedMoneyTopics("I am on a tight budget, what do you offer?"), [] as MoneyTopic[],
  "false positive: budget as a constraint, not a question about price");
eq(askedMoneyTopics("how do I pay my application?"), [] as MoneyTopic[],
  "false positive: 'pay' asks about process, not about an amount");
eq(askedMoneyTopics("do you have student accommodation on campus?"), [] as MoneyTopic[],
  "false positive: accommodation availability is a facilities question");
eq(askedMoneyTopics("can I defer my start date to the next intake?"), [] as MoneyTopic[],
  "false positive: deferral is a process question, not a refund question");
eq(askedMoneyTopics("do I need proof of funds for the visa?"), [] as MoneyTopic[],
  "false positive: a document requirement, not an amount");

// ── Still caught: the same ambiguous words WITH a cost sense are real money questions ──
eq(askedMoneyTopics("how much do I pay per semester?"), ["fees"] as MoneyTopic[],
  "cost sense present: 'how much ... pay'");
eq(askedMoneyTopics("how much is accommodation per month?"), ["living"] as MoneyTopic[],
  "cost sense present: accommodation + how much");
eq(askedMoneyTopics("do I get a refund if I defer?"), ["refund"] as MoneyTopic[],
  "cost sense present: defer + refund");
eq(askedMoneyTopics("what are the tuition fees?"), ["fees"] as MoneyTopic[], "plain fee question");
eq(askedMoneyTopics("are there any scholarships?"), ["scholarship"] as MoneyTopic[], "plain scholarship question");

// ── The gate itself must stop firing on the false positives ──
eq(shouldWithholdMoney("do you offer a finance course?", []), false,
  "a finance COURSE question is answerable with no fee data at all");
eq(shouldWithholdMoney("do you have student accommodation?", []), false,
  "accommodation availability is answerable with no cost data");
eq(shouldWithholdMoney("what are the fees?", []), true, "a real fee question still withholds");

// ── The cost sense belongs to its own clause ──
// "What are the fees, and can I defer my start date?" used to read 'defer' as a refund topic,
// because the cost word was looked for anywhere in the message. The withhold line for `refund`
// names deferrals, so the fee clause gagged a start-date answer we already hold (Greptile).
eq(askedMoneyTopics("what are the fees, and can I defer my start date?"), ["fees"] as MoneyTopic[],
  "a fee clause does not make 'defer' in the next clause a refund question");
eq(askedMoneyTopics("what is the tuition? I might need to cancel later."), ["fees"] as MoneyTopic[],
  "nor 'cancel' in the next sentence");
eq(askedMoneyTopics("do you have accommodation and what are the tuition fees?"), ["fees"] as MoneyTopic[],
  "nor 'accommodation' a living-cost question");
eq(shouldWithholdMoney("what are the fees, and can I defer my start date?", ["fees"]), false,
  "with the fees grounded, nothing is withheld — the deferral answer survives");

// Same clause, same words: still caught. This is the half that must not be lost.
eq(askedMoneyTopics("what are the fees, and is the deposit refundable?"), ["fees", "refund"] as MoneyTopic[],
  "a refund word in its OWN clause is still a refund question");
eq(askedMoneyTopics("how much does accommodation cost and when can I move in?"), ["fees", "living"] as MoneyTopic[],
  "cost sense beside its own ambiguous word, in clause one");

// ponytail: the accepted cost of clause scoping — a cost sense split from its subject by a
// conjunction no longer promotes it. `fees` still fires, so the turn is not ungated; only the
// `living` topic is missed, and the prompt's "money comes only from CONTEXT" rule still holds.
eq(askedMoneyTopics("is accommodation available, and how much does it cost?"), ["fees"] as MoneyTopic[],
  "known gap: 'it' in the next clause is not resolved back to accommodation");

// ── Context side stays BROAD: generous about what counts as evidence ──
// Narrowing both sides would withhold MORE, not less: a passage that mentions rent in prose
// must still ground a cost-of-living question even though "rent" alone is ambiguous.
eq(moneyTopicsOf("rent on a shared room is 5000 per month"), ["living"] as MoneyTopic[],
  "context: bare 'rent'-class wording still counts as living evidence");
eq(shouldWithholdMoney("how much is accommodation per month?", moneyTopicsOf("rent is 5000 per month")), false,
  "context prose about rent grounds the accommodation cost question");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
