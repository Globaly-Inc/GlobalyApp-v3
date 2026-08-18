// Wave A-COV — the fee matcher and the installment splitter.
//
// This is arithmetic over money, so nothing here is asserted with a tolerance.
// Two properties carry the weight:
//   - a matched fee's amount reaches the staging writer byte-identical (the matcher
//     never re-derives, rounds or sums an amount), and
//   - a split total is exact to the cent: every installment is a real money value
//     and the parts add back up to the whole.
// 971 of the 8,541 fee rows in the migrated V1 corpus are fractional (20938.50,
// 16462.75, 20045.45), so "amounts are whole dollars" is not an available excuse.

import { describe, expect, it } from "vitest";

import {
  fuzzyMatchCourseToFee,
  matchFeesToCourses,
} from "../../src/modules/superadmin/data-extraction/lib/fee-matcher.js";
import { parseInstallments } from "../../src/modules/superadmin/data-extraction/lib/installment-parser.js";

/** Course names sampled from superadmin.extraction_courses in the migrated corpus. */
const REAL_COURSE_NAMES = [
  "Masters of Social Work",
  "Doctor of Philosophy in Chemical Engineering",
  "Bachelor of Creative Arts (Theatre Arts)",
  "Master of Engineering (ME) - Electrical Engineering Specialization",
  "M.Sc. in Nutrition and Dietetics",
  "Bachelor of Science in Animal Behavior",
];

const fee = (course_name: string, amount: number, student_type = "international") => ({
  course_name,
  student_type,
  amount,
  currency: "AUD",
  period: "Per Year",
});

describe("fuzzyMatchCourseToFee", () => {
  it("scores an identical pair exactly 1 — the formula's ceiling, not near it", () => {
    // 0.7 * (2 shared / 2 union) + 0.3 * (1 - 0) == 1 with no float residue.
    expect(fuzzyMatchCourseToFee("Computer Science", "Computer Science")).toBe(1);
  });

  it("treats a degree prefix as noise, so the fee table's bare name still matches", () => {
    expect(fuzzyMatchCourseToFee("Bachelor of Computer Science", "Computer Science")).toBe(1);
    expect(fuzzyMatchCourseToFee("Certificate III in Carpentry", "Carpentry")).toBe(1);
  });

  it("strips at most one prefix, because the list is checked with a break", () => {
    // "Bachelor of Master of Nursing" is not a real degree; the point is that the loop
    // stops at the first hit, so a second prefix survives into the tokens.
    expect(fuzzyMatchCourseToFee("Master of Nursing", "Nursing")).toBe(1);
    expect(fuzzyMatchCourseToFee("Bachelor of Master of Nursing", "Nursing")).toBeLessThan(1);
  });

  it("keeps unrelated pairs under the 0.5 threshold", () => {
    expect(
      fuzzyMatchCourseToFee("Bachelor of Computer Science", "Diploma of Hairdressing"),
    ).toBeLessThan(0.5);
    expect(fuzzyMatchCourseToFee("Master of Nursing", "Master of Laws")).toBeLessThan(0.5);
  });

  it("ranks the closer of two real corpus names higher", () => {
    const target = "Doctor of Philosophy in Chemical Engineering";
    const close = fuzzyMatchCourseToFee(target, "PhD in Chemical Engineering");
    const far = fuzzyMatchCourseToFee(target, "Bachelor of Science in Animal Behavior");
    expect(close).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.5);
  });

  it("does not manufacture a match out of a punctuation-only name", () => {
    // A punctuation-only name normalises to zero tokens, and tokenOverlap answers 1
    // for two empty sets. The Levenshtein half is what has to hold the line here.
    expect(fuzzyMatchCourseToFee("Computer Science", "—")).toBeLessThan(0.5);
    expect(fuzzyMatchCourseToFee("", "Computer Science")).toBeLessThan(0.5);
  });

  it("is symmetric — argument order cannot decide a link", () => {
    for (const name of REAL_COURSE_NAMES) {
      expect(fuzzyMatchCourseToFee(name, "Master of Social Work")).toBe(
        fuzzyMatchCourseToFee("Master of Social Work", name),
      );
    }
  });
});

describe("matchFeesToCourses", () => {
  const courses = [
    { id: "c1", name: "Bachelor of Computer Science" },
    { id: "c2", name: "Master of Nursing" },
    { id: "c3", name: "Diploma of Business" },
  ];

  it("gives one course both of its student-type fees", () => {
    const matches = matchFeesToCourses(
      [fee("Computer Science", 30000, "international"), fee("Computer Science", 10000, "domestic")],
      courses,
    );
    expect(matches.map((m) => m.courseId)).toEqual(["c1", "c1"]);
    expect(matches.map((m) => m.fee.student_type)).toEqual(["international", "domestic"]);
  });

  it("drops a fee no course claims rather than parking it on the closest one", () => {
    // A fee attached to the wrong course is a wrong price on a live catalog page.
    // Unmatched is the safe outcome; the worker reports the count as `unmatched`.
    expect(matchFeesToCourses([fee("Underwater Basket Weaving", 5000)], courses)).toEqual([]);
  });

  it("passes the amount through untouched, to the cent", () => {
    const [match] = matchFeesToCourses([fee("Computer Science", 20938.5)], courses);
    expect(match.fee.amount).toBe(20938.5);
    expect(match.fee.currency).toBe("AUD");
  });

  it("never sums two fees for the same course into one", () => {
    const matches = matchFeesToCourses(
      [fee("Computer Science", 8000.5), fee("Computer Science", 8000.5)],
      courses,
    );
    expect(matches).toHaveLength(2);
    // 8000.50 + 8000.50 in IEEE-754 is 16001.000000000002; the matcher must never be
    // the place that discovers this.
    expect(matches.map((m) => m.fee.amount)).toEqual([8000.5, 8000.5]);
  });

  it("resolves a tie to the first course, deterministically across runs", () => {
    const twins = [
      { id: "first", name: "Bachelor of Nursing" },
      { id: "second", name: "Bachelor of Nursing" },
    ];
    for (let i = 0; i < 3; i++) {
      expect(matchFeesToCourses([fee("Nursing", 1000)], twins)[0].courseId).toBe("first");
    }
  });

  it("returns nothing when either side is empty", () => {
    expect(matchFeesToCourses([fee("Computer Science", 1000)], [])).toEqual([]);
    expect(matchFeesToCourses([], courses)).toEqual([]);
  });
});

// ── installment splitting ──────────────────────────────────────────────────

/** Total in cents, so the assertion is integer arithmetic and cannot drift. */
const cents = (n: number) => Math.round(n * 100);
const sumCents = (parts: Array<{ amount: number }>) =>
  parts.reduce((s, p) => s + cents(p.amount), 0);

describe("parseInstallments", () => {
  it("returns nothing for a zero or negative total instead of a $0 schedule", () => {
    expect(parseInstallments({ totalAmount: 0 })).toEqual([]);
    expect(parseInstallments({ totalAmount: -100 })).toEqual([]);
  });

  it("labels an unsplittable fee 'Total' and keeps the whole amount", () => {
    expect(parseInstallments({ totalAmount: 10000 })).toEqual([{ label: "Total", amount: 10000 }]);
    expect(parseInstallments({ totalAmount: 500, periodType: "Per Unit" })).toEqual([
      { label: "Total", amount: 500 },
    ]);
  });

  it("splits by period type and duration, putting the remainder last", () => {
    const parts = parseInstallments({
      totalAmount: 10001,
      periodType: "Per Semester",
      durationWeeks: 104,
    });
    expect(parts).toEqual([
      { label: "Year 1 Semester 1", amount: 2500 },
      { label: "Year 1 Semester 2", amount: 2500 },
      { label: "Year 2 Semester 1", amount: 2500 },
      { label: "Year 2 Semester 2", amount: 2501 },
    ]);
  });

  it("lets an explicit text hint override the period type", () => {
    const parts = parseInstallments({
      totalAmount: 6000,
      periodType: "Per Year",
      text: "3 terms",
      durationWeeks: 52,
    });
    expect(parts.map((p) => p.label)).toEqual(["Term 1", "Term 2", "Term 3"]);
    expect(sumCents(parts)).toBe(cents(6000));
  });

  it("clamps an absurd installment count instead of emitting hundreds of rows", () => {
    expect(parseInstallments({ totalAmount: 1200, text: "600 installments" })).toHaveLength(12);
    expect(parseInstallments({ totalAmount: 1200, text: "0 installments" })).toHaveLength(1);
  });

  it("splits a fractional total to the cent, with no float residue in any part", () => {
    // 20938.50 and 16462.75 are real amounts from the migrated corpus, where 971 of
    // 8,541 fee rows are fractional. An installment of 3334.1000000000004 is a wrong
    // number on an admin's screen even when the parts happen to re-sum.
    for (const total of [20938.5, 16462.75, 10000.1, 8000.5]) {
      for (const count of [2, 3, 4]) {
        const parts = parseInstallments({
          totalAmount: total,
          periodType: "Per Semester",
          durationWeeks: 26 * count,
        });
        expect(parts.length).toBeGreaterThan(0);
        expect(sumCents(parts)).toBe(cents(total));
        for (const part of parts) {
          expect(part.amount).toBe(Math.round(part.amount * 100) / 100);
        }
      }
    }
  });

  it("keeps a two-decimal total exact across every splitting rule it has", () => {
    const cases = [
      { totalAmount: 20045.45, periodType: "Per Trimester", durationWeeks: 52 },
      { totalAmount: 20045.45, periodType: "Total", durationWeeks: 104 },
      { totalAmount: 20045.45, periodType: "Per Year", durationWeeks: 156 },
      { totalAmount: 20045.45, durationWeeks: 104 },
      { totalAmount: 20045.45, text: "quarterly" },
      { totalAmount: 20045.45, text: "half year" },
    ];
    for (const c of cases) {
      const parts = parseInstallments(c);
      expect(sumCents(parts)).toBe(cents(20045.45));
      for (const part of parts) expect(part.amount).toBe(Math.round(part.amount * 100) / 100);
    }
  });
});
