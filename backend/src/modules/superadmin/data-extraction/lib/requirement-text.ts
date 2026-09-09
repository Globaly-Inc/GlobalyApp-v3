// Pure text-mining helpers for scripts/eligibility-backfill.ts, split out so they can be
// regression-tested without a database. See tests/eligibility-backfill-parsing.ts.
//
// These read requirement text that has ALREADY been stored, recovering standardised admission
// tests that the extractor had nowhere to put and so left in a requirement's name or notes.
// Everything here errs toward recording no score rather than a wrong one: a fabricated minimum
// is what this whole repair exists to undo.

/** Wording that makes a stated number a cohort statistic rather than a bar to clear. */
const STATISTIC = /average|\bmean\b|median|typical|percentile|\d+\s*(?:st|nd|rd|th)\b|middle\s*50|range\s+of/i;

/**
 * A sentence boundary: `.` or `;` followed by whitespace or end of text.
 *
 * The lookahead is what makes it correct — a bare `.` also sits inside every decimal score, and
 * splitting on that cut "49.5" down to "49". Scores are routinely fractional (GMAT section
 * scores, GPA-style scales), so no sentence-splitting here may treat a decimal point as a stop.
 */
const SENTENCE_END = /[.;](?=\s|$)/g;

/** The sentence containing `at`, as [start, end) offsets into `text`. */
function clauseAround(text: string, at: number): { start: number; end: number } {
  let start = 0;
  let end = text.length;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
    if (m.index < at) start = m.index + 1;
    else { end = m.index; break; }
  }
  return { start, end };
}

export interface FoundTest {
  test_name: string;
  /** A stated minimum — a bar the applicant must clear. Gates the eligibility verdict. */
  score: string | null;
  /** What admitted students scored (average/median/percentile). Context only, never a bar. */
  typical_score: string | null;
  is_optional: boolean;
}

/**
 * Wording that makes a test optional rather than required.
 *
 * `neither` earns its place: "Neither GRE nor GMAT are strict requirements" is a negation
 * carrying no "not", and it is how a real scraped row states test-optional admissions.
 */
const OPTIONAL = /optional|recommended|\bneither\b|not\s+(?:a\s+)?(?:strict\s+)?(?:require|mandatory)|no[t]?\s+strict|waiv|may\s+(?:be\s+)?submit|encouraged|if\s+available|test[- ]optional/i;

/**
 * A test named in this text, the minimum score stated for it, and whether it is optional.
 *
 * Scores are claimed conservatively, because the whole point of this repair is to stop turning
 * prose into requirements:
 *
 *   - EVERY mention of the test is considered, not just the first. The first mention is usually
 *     inside the requirement's own name ("GRE Quantitative Score (Optional)"), so a 40-character
 *     window from it never reaches the sentence that carries the number.
 *   - A number is only taken from a sentence that reads as a floor. If the sentence around it
 *     says average/median/percentile/typical, the number is a statistic and is left out — this
 *     is the same rule pass 1 applies, and without it better recall would simply re-create the
 *     fabricated minimum one column to the left.
 *   - Percentages and ordinals are excluded outright.
 *
 * A test found with no score is still recorded: "this course wants a GMAT, no minimum stated" is
 * both true and useful, and the admin can add the number. Better an honest blank than a guess.
 */
/**
 * A catalogue name as a regex.
 *
 * Test names come from the admin-managed `public.tests` table, so they are DATA, not literals.
 * Interpolated raw, "TOEFL (iBT)" becomes a capture group that matches "TOEFL iBT" and misses the
 * real text, and "C++" is `\bC++\b` — a nested quantifier, which throws SyntaxError. The passes of
 * the backfill do not share a transaction, so a throw here aborts an `--apply` run that has
 * already committed pass 1's score clearing.
 *
 * `\b` is applied only at an end that is actually a word character: `\b` after the ")" of
 * "TOEFL (iBT)" demands a letter immediately following the paren, so it could never match.
 */
export function testPattern(name: string, flags: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^\w/.test(name) ? "\\b" : "";
  const tail = /\w$/.test(name) ? "\\b" : "";
  return new RegExp(`${lead}${escaped}${tail}`, flags);
}

export function findTests(
  text: string,
  catalogue: string[],
): FoundTest[] {
  const found: FoundTest[] = [];

  for (const name of catalogue) {
    const word = testPattern(name, "gi");
    if (!word.test(text)) continue;
    // Longest-first catalogue: don't add "GRE" when "GRE Subject" already matched here.
    if (found.some((f) => f.test_name.toLowerCase().includes(name.toLowerCase()))) continue;

    let score: string | null = null;
    let typical: string | null = null;
    word.lastIndex = 0;
    for (let m = word.exec(text); m && !score; m = word.exec(text)) {
      // The number is read FORWARD from this mention and stops at the next test named in the
      // clause — otherwise "SAT of 1200 or ACT of 25" hands 1200 to both of them.
      const { start: clauseStart, end: clauseEnd } = clauseAround(text, m.index);
      const after = m.index + name.length;
      const nextTest = catalogue
        .map((other) => testPattern(other, "i").exec(text.slice(after)))
        .filter((hit): hit is RegExpExecArray => hit != null)
        .map((hit) => after + hit.index);
      const window = text.slice(after, Math.min(clauseEnd, ...nextTest, after + 60));

      // No academic admission test is scored anywhere near 1900-2099 (SAT caps at 1600, GMAT 800,
      // GRE 340, ACT 36), so a year-shaped number is a year — "optional for 2027 entry" is not a
      // score of 2027. One rule instead of a per-test range table.
      const hit = window.match(/\b(\d{2,4}(?:\.\d+)?)\b(?!\s*(?:%|percent|st|nd|rd|th))/i);
      if (!hit || /^(?:19|20)\d{2}$/.test(hit[1])) continue;

      // Statistical wording is judged over the whole punctuation-bounded clause, so "Median GRE
      // quantitative score ... is 167" is never read as a floor. The number is still captured —
      // as `typical_score`, which describes the admitted cohort and gates nothing. Recording it
      // as a minimum is the bug this whole repair exists to undo; discarding it loses a figure a
      // student genuinely wants ("admitted students averaged 49.5"), which is why it gets its own
      // field rather than being dropped or promoted.
      if (STATISTIC.test(text.slice(clauseStart, clauseEnd))) typical ??= hit[1];
      else score = hit[1];
    }

    found.push({
      test_name: name,
      score,
      typical_score: score ? null : typical,
      is_optional: OPTIONAL.test(text),
    });
  }
  return found;
}
