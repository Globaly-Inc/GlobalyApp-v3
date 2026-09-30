/**
 * Jev value pickers: the regex finds candidates, Jev (faked) picks one, code copies it verbatim.
 * Run: npm run test:jev-pickers
 */
import { _jevDeps } from "../src/modules/superadmin/data-extraction/lib/jev-client.js";
import {
  _pickerDeps, DURATION_RE, fillFromPicks, findCandidates, MONEY_RE, parseMoney,
} from "../src/modules/superadmin/data-extraction/lib/jev-pickers.js";
import type { ExtractedCourse } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── candidates ──────────────────────────────────────────────────────────────
const page = "BEng Electrical Engineering. Duration: 3 years full-time, or 4 years with a 12-month placement. "
  + "Home students: £9,790 per year. International students: £16,020 per year. Application fee $50. Deposit £2,000.";
eq(findCandidates(page, DURATION_RE).map((c) => c.span), ["3 years", "4 years", "12-month"], "every duration phrase is a candidate");
eq(findCandidates(page, MONEY_RE).map((c) => c.span), ["£9,790", "£16,020", "£2,000"], "money needs 3+ digits: '$50' is not tuition-sized");
eq(findCandidates("AUD 32,500 per year and 32,500 AUD", MONEY_RE).map((c) => c.span), ["AUD 32,500", "32,500 AUD"], "code before or after the number");
eq(findCandidates(page, DURATION_RE)[0].context.includes("Duration:"), true, "each candidate carries its surrounding text");

eq(parseMoney("£16,020"), { amount: 16020, currency: "GBP" }, "GBP from £");
eq(parseMoney("A$ 38 400"), { amount: 38400, currency: "AUD" }, "space-grouped AUD");
eq(parseMoney("$25,000"), { amount: 25000, currency: null }, "a bare $ names no currency — null, not a guess");
eq(parseMoney("USD 1,250.50"), { amount: 1250.5, currency: "USD" }, "decimals");
eq(parseMoney("CA$32,500"), { amount: 32500, currency: "CAD" }, "CA$ is Canadian, not the A$ inside it");
eq(parseMoney("US$ 40,000"), { amount: 40000, currency: "USD" }, "US$ is not the S$ inside it");

// ── picks (Jev faked) ───────────────────────────────────────────────────────
type Answers = Record<string, { choice: string; confidence: number }>;
const jevAnswers = (byQuestion: (q: string) => { choice: string; confidence: number }) => {
  _jevDeps.systemOne = (async (req: { questions: Record<string, unknown> }) => {
    const answers: Answers = {};
    for (const q of Object.keys(req.questions)) answers[q] = byQuestion(q);
    return { answers };
  }) as unknown as typeof _jevDeps.systemOne;
};
const course = (): ExtractedCourse => ({ name: "BEng Electrical Engineering" } as ExtractedCourse);
_pickerDeps.minConf = () => 0.6;

// Candidate ids: durations c1 "3 years" …; money c1 "£9,790", c2 "£16,020", c3 "£2,000".
jevAnswers((q) => ({
  duration: { choice: "c1", confidence: 0.9 },
  international: { choice: "c2", confidence: 0.9 },
  domestic: { choice: "c1", confidence: 0.8 },
  international_period: { choice: "Per Year", confidence: 0.9 },
  domestic_period: { choice: "Per Year", confidence: 0.9 },
}[q]!));
{
  const c = course();
  const filled = await fillFromPicks(c, page);
  eq(c.duration_text, "3 years", "duration: the picked span, verbatim");
  eq(c.fees?.map((f) => [f.student_type, f.total_amount, f.currency, f.period_type]),
    [["international", 16020, "GBP", "Per Year"], ["domestic", 9790, "GBP", "Per Year"]], "tuition: one fee per student type");
  eq(filled, { duration: "3 years", fees: 2 }, "reports what it filled");
}

jevAnswers((q) => (q.endsWith("period") ? { choice: "Per Year", confidence: 0.9 } : { choice: "c2", confidence: 0.9 }));
{
  const c = course();
  await fillFromPicks(c, page);
  eq(c.fees?.map((f) => [f.student_type, f.period_type]), [["both", "Per Year"]], "same figure for both → ONE 'both' fee");
}

jevAnswers((q) => (q.endsWith("period") ? { choice: "unclear", confidence: 0.9 } : { choice: "c2", confidence: 0.9 }));
{
  const c = course();
  await fillFromPicks(c, page);
  eq(c.fees, undefined, "'unclear' period → no fee (the writer would default it to Per Year)");
}

jevAnswers(() => ({ choice: "c1", confidence: 0.9 }));
{
  const c = course();
  await fillFromPicks(c, "This four-year degree prepares nurses.");
  eq(c.duration_text, "four year", "a hyphenated span is normalised to what parseDurationText reads");
}

jevAnswers(() => ({ choice: "none", confidence: 0.99 }));
{
  const c = course();
  eq(await fillFromPicks(c, page), null, "'none' fills nothing");
  eq([c.duration_text, c.fees], [undefined, undefined], "…and leaves the course untouched");
}

jevAnswers(() => ({ choice: "c1", confidence: 0.4 }));
eq(await fillFromPicks(course(), page), null, "a pick below JEV_PICK_MIN_CONF is discarded");

jevAnswers(() => ({ choice: "c1", confidence: 0.9 }));
{
  const c = { ...course(), duration_weeks: 156, fees: [{ name: "Tuition Fee", total_amount: 9000, student_type: "both" }] } as ExtractedCourse;
  eq(await fillFromPicks(c, page), null, "never overrides what the model already filled");
}

_pickerDeps.minConf = () => null;
let called = 0;
_jevDeps.systemOne = (async () => { called++; throw new Error("should not be called"); }) as unknown as typeof _jevDeps.systemOne;
eq([await fillFromPicks(course(), page), called], [null, 0], "off → no Jev call at all");

_pickerDeps.minConf = () => 0.6;
_jevDeps.systemOne = (async () => { throw new Error("429"); }) as unknown as typeof _jevDeps.systemOne;
{
  const c = course();
  eq([await fillFromPicks(c, page), c.fees], [null, undefined], "Jev failure → the model's answer stands");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
