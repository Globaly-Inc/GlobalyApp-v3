// Select-don't-generate for the fields extraction fills worst (2026-09-30, all jobs: duration 32%,
// fees 47%). A regex over-finds every duration/amount on the page, Jev (TypeSafe) picks which one
// the question asks for — or "none" — and code copies that span verbatim, so a picked value can
// never be invented or have a digit transposed. Only for a page about ONE course (a listing's
// amounts belong to many) and only for a field the model left empty.
//
// OFF unless TYPESAFE_API_KEY and JEV_PICK_MIN_CONF are set; a pick below that confidence is
// discarded. Every failure leaves the course exactly as the model returned it.

import { choice } from "@typesafe-ai/sdk";
import { createChildLogger } from "../../../../shared/logger.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";
import { parseDurationText, resolveDurationWeeks, type ExtractedCourse, type ExtractedFee } from "./staging-writer.js";

const logger = createChildLogger("jev-pickers");

export interface Candidate { id: string; span: string; context: string }

const CONTEXT_CHARS = 160;
const MAX_CANDIDATES = 40;
const NONE = "none";

/** Every match with the text around it, deduped on span + context, in page order. Pure. */
export function findCandidates(text: string, re: RegExp, max = MAX_CANDIDATES): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
    const start = m.index ?? 0;
    const span = m[0].trim();
    const context = text.slice(Math.max(0, start - CONTEXT_CHARS), start + span.length + CONTEXT_CHARS).replace(/\s+/g, " ").trim();
    const key = `${span}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `c${out.length + 1}`, span, context });
    if (out.length >= max) break;
  }
  return out;
}

// Only units parseDurationText understands ("quarters" is not one), so a picked span always resolves.
export const DURATION_RE = /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?[\s-]*(?:years?|yrs?|semesters?|terms?|trimesters?|months?|weeks?)\b/gi;

/** "4-year" / "two-year" → "4 year" / "two year": parseDurationText allows only spaces before the unit. */
export function durationTextOf(span: string): string | null {
  const text = span.replace(/(\w)-(?=(?:years?|yrs?|semesters?|terms?|trimesters?|months?|weeks?)\b)/i, "$1 ");
  return parseDurationText(text) ? text : null;
}

const CUR = String.raw`(?:A\$|AU\$|AUD|CA\$|CAD|NZ\$|NZD|US\$|USD|S\$|SGD|HK\$|HKD|GBP|EUR|INR|NPR|£|€|₹|\$)`;
const NUM = String.raw`\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?`;
export const MONEY_RE = new RegExp(`${CUR}\\s?(?:${NUM})|(?:${NUM})\\s?(?:AUD|CAD|NZD|USD|SGD|HKD|GBP|EUR|INR|NPR)\\b`, "g");

// Order matters: "A$" is inside "CA$" and "S$" inside "US$", so the longer prefixes are tested first.
const CURRENCY_OF: Array<[RegExp, string]> = [
  [/CA\$|CAD/, "CAD"], [/NZ\$|NZD/, "NZD"], [/US\$|USD/, "USD"], [/HK\$|HKD/, "HKD"],
  [/AU\$|A\$|AUD/, "AUD"], [/S\$|SGD/, "SGD"], [/£|GBP/, "GBP"], [/€|EUR/, "EUR"], [/₹|INR/, "INR"], [/NPR/, "NPR"],
];

/** Amount and currency out of a picked span. A bare "$" names no currency: null, never a guess. Pure. */
export function parseMoney(span: string): { amount: number; currency: string | null } | null {
  const digits = span.match(/\d[\d,\s]*(?:\.\d{1,2})?/)?.[0].replace(/[,\s]/g, "");
  const amount = digits ? Number(digits) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: CURRENCY_OF.find(([re]) => re.test(span))?.[1] ?? null };
}

const PERIODS = { "Per Year": "per academic year", "Per Semester": "per semester", "Per Term": "per term",
  "Per Trimester": "per trimester", "Per Unit": "per unit, credit or credit hour", "Per Week": "per week",
  Total: "for the whole programme", unclear: "the page does not say what period it covers" } as const;

function optionsFor(candidates: Candidate[]) {
  const criteria: Record<string, string> = {};
  for (const c of candidates) criteria[c.id] = `"${c.span}" — …${c.context}…`;
  criteria[NONE] = "None of these is it";
  return criteria;
}

export const _pickerDeps = { minConf: (): number | null => jevThreshold("JEV_PICK_MIN_CONF") };

/** The course's own full-time length, verbatim, or null. */
export async function pickDuration(courseName: string, markdown: string, minConf: number): Promise<string | null> {
  const candidates = findCandidates(markdown, DURATION_RE);
  if (!candidates.length) return null;
  const { answers } = await _jevDeps.systemOne({
    state: { course_name: courseName, candidates: candidates.map(({ id, span, context }) => ({ id, span, context })) },
    questions: {
      duration: choice(
        "Which candidate states how long it takes to complete `course_name` studying full-time? Not a placement, " +
        "module, semester length, work experience, or another programme's duration.",
        optionsFor(candidates),
      ),
    },
  });
  const a = answers.duration;
  if (a.choice === NONE || a.confidence < minConf) return null;
  return candidates.find((c) => c.id === a.choice)?.span ?? null;
}

/** Tuition picks for the course, as fees the writer already knows how to store. */
export async function pickTuition(courseName: string, markdown: string, minConf: number): Promise<ExtractedFee[]> {
  const candidates = findCandidates(markdown, MONEY_RE);
  if (!candidates.length) return [];
  const opts = optionsFor(candidates);
  const periodOpts = { ...PERIODS };
  const { answers } = await _jevDeps.systemOne({
    state: { course_name: courseName, candidates: candidates.map(({ id, span, context }) => ({ id, span, context })) },
    questions: {
      international: choice("Which candidate is the TUITION fee an INTERNATIONAL student pays for `course_name`? Not an application fee, deposit, accommodation, or another programme's fee.", opts),
      domestic: choice("Which candidate is the TUITION fee a DOMESTIC (home / in-state) student pays for `course_name`? Not an application fee, deposit, accommodation, or another programme's fee.", opts),
      international_period: choice("Assume the international tuition fee for `course_name` is on this page. What period does it cover?", periodOpts),
      domestic_period: choice("Assume the domestic tuition fee for `course_name` is on this page. What period does it cover?", periodOpts),
    },
  });
  const picked = (key: "international" | "domestic") => {
    const a = answers[key];
    if (a.choice === NONE || a.confidence < minConf) return null;
    const c = candidates.find((x) => x.id === a.choice);
    const money = c ? parseMoney(c.span) : null;
    return c && money ? { c, money } : null;
  };
  // No confident period → no fee. upsertFee turns a missing period into "Per Year", so a total
  // programme cost would be published as an annual one.
  const period = (key: "international_period" | "domestic_period") =>
    answers[key].choice === "unclear" || answers[key].confidence < minConf ? null : answers[key].choice;

  const intl = picked("international");
  const dom = picked("domestic");
  const fee = (p: NonNullable<ReturnType<typeof picked>>, student_type: string, period_type: string | null): ExtractedFee[] =>
    period_type ? [{ name: "Tuition Fee", description: p.c.context, student_type, period_type, currency: p.money.currency, total_amount: p.money.amount }] : [];
  // One figure picked for both is ONE fee for everyone, not two copies of it.
  if (intl && dom && intl.c.span === dom.c.span) return fee(intl, "both", period("international_period"));
  return [
    ...(intl ? fee(intl, "international", period("international_period")) : []),
    ...(dom ? fee(dom, "domestic", period("domestic_period")) : []),
  ];
}

/**
 * Fill what the model left empty on a single-course page. Returns what was filled (for the job
 * event) — never throws.
 */
export async function fillFromPicks(course: ExtractedCourse, markdown: string): Promise<{ duration?: string; fees?: number } | null> {
  const minConf = _pickerDeps.minConf();
  if (minConf == null || !course.name) return null;
  const filled: { duration?: string; fees?: number } = {};
  try {
    if (resolveDurationWeeks(course) == null) {
      const span = await pickDuration(course.name, markdown, minConf);
      const text = span ? durationTextOf(span) : null;
      if (text) { course.duration_text = text; filled.duration = text; }
    }
    const hasFee = course.fees?.some((f) => f.total_amount != null && f.total_amount !== "");
    if (!hasFee) {
      const fees = await pickTuition(course.name, markdown, minConf);
      if (fees.length) { course.fees = [...(course.fees ?? []), ...fees]; filled.fees = fees.length; }
    }
  } catch (err) {
    logger.warn("Jev picks failed; keeping the model's answer", { course: course.name, err: err instanceof Error ? err.message : String(err) });
  }
  return filled.duration || filled.fees ? filled : null;
}
