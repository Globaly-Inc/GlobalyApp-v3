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
import { moneyTopicsOf, shouldWithholdMoney, isMoneyQuestion, type MoneyTopic } from "../src/modules/ai-counsellor/services/rag.service.js";

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
