// SOP draft analysis and prompt assembly — pure functions, no DB, no provider.
//
// The limits and phrases exercised here are the ones V1 seeded into sop_config, so a
// change to the seed that breaks the compliance check fails here rather than in a
// student's UCAS submission.

import { describe, expect, it } from "vitest";

import {
  analyse,
  editDepthPct,
  findBannedPhrases,
  specificityRatio,
  wordCount,
  withinCharLimit,
  withinWordLimit,
  type SopLimits,
} from "../../src/modules/sop/lib/analysis.js";
import {
  antiHallucinationRules,
  buildSystemPrompt,
  draftInstruction,
} from "../../src/modules/sop/lib/prompt.js";

/** V1's AU university_sop row. */
const AU: SopLimits = {
  min_words: 500,
  max_words: 1000,
  max_chars: null,
  banned_phrases: ["I am writing to express my interest", "since a young age", "passion for"],
};

/** V1's UK ucas_statement row: a character cap and no word window at all. */
const UK: SopLimits = {
  min_words: null,
  max_words: null,
  max_chars: 4000,
  banned_phrases: ["since a young age"],
};

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("wordCount", () => {
  it("counts on any run of whitespace, not just single spaces", () => {
    expect(wordCount("one two\tthree\n\nfour  five")).toBe(5);
  });

  it("is zero for whitespace only", () => {
    expect(wordCount("   \n\t ")).toBe(0);
  });
});

describe("findBannedPhrases", () => {
  it("matches regardless of case, because a reader does not care about case", () => {
    expect(findBannedPhrases("Since A Young Age I have liked maths.", AU.banned_phrases)).toEqual([
      "since a young age",
    ]);
  });

  it("returns every phrase present, in the order sop_config lists them", () => {
    const text = "I have a passion for maths and since a young age too.";
    expect(findBannedPhrases(text, AU.banned_phrases)).toEqual([
      "since a young age",
      "passion for",
    ]);
  });

  it("ignores empty entries rather than matching everything", () => {
    expect(findBannedPhrases("anything at all", ["", "   "])).toEqual([]);
  });
});

describe("limits", () => {
  it("enforces both ends of a word window", () => {
    expect(withinWordLimit(499, AU)).toBe(false);
    expect(withinWordLimit(500, AU)).toBe(true);
    expect(withinWordLimit(1000, AU)).toBe(true);
    expect(withinWordLimit(1001, AU)).toBe(false);
  });

  it("treats a null limit as no limit, not as zero", () => {
    expect(withinWordLimit(12_000, UK)).toBe(true);
    expect(withinCharLimit(500_000, AU)).toBe(true);
  });

  it("enforces the UCAS 4000-character cap exactly", () => {
    expect(withinCharLimit(4000, UK)).toBe(true);
    expect(withinCharLimit(4001, UK)).toBe(false);
  });
});

describe("specificityRatio", () => {
  it("is zero on empty text rather than dividing by zero", () => {
    expect(specificityRatio("")).toBe(0);
  });

  it("counts sentences carrying a number or a proper noun", () => {
    // Two of four sentences are anchored.
    const text = "I worked at Deloitte. It was fine. I led 3 projects. It went well.";
    expect(specificityRatio(text)).toBeCloseTo(0.5, 5);
  });
});

describe("analyse", () => {
  it("scores a compliant, specific draft near the top", () => {
    const text = `${words(600)}. I joined Deloitte in 2021 and led 3 pricing reviews.`;
    const result = analyse(text, AU);
    expect(result.banned_phrases_found).toEqual([]);
    expect(result.within_word_limit).toBe(true);
    expect(result.quality_breakdown.length).toBe(30);
    expect(result.quality_breakdown.phrasing).toBe(30);
    expect(result.quality_score).toBeGreaterThan(30);
    expect(result.quality_score).toBeLessThanOrEqual(100);
  });

  it("zeroes the phrasing component when a banned phrase is present", () => {
    const text = `${words(600)} and I have had a passion for this since a young age.`;
    const result = analyse(text, AU);
    expect(result.quality_breakdown.phrasing).toBe(0);
    expect(result.banned_phrases_found).toHaveLength(2);
  });

  it("zeroes the length component for a draft under the minimum", () => {
    const result = analyse(words(100), AU);
    expect(result.within_word_limit).toBe(false);
    expect(result.quality_breakdown.length).toBe(0);
  });

  it("keeps the score inside 0..100, which the column's CHECK requires", () => {
    for (const text of ["", words(1), words(5000), "A. B. C. 1 2 3."]) {
      const { quality_score } = analyse(text, AU);
      expect(quality_score).toBeGreaterThanOrEqual(0);
      expect(quality_score).toBeLessThanOrEqual(100);
    }
  });
});

describe("editDepthPct", () => {
  it("is zero for an untouched draft", () => {
    expect(editDepthPct("the same text", "the same text")).toBe(0);
  });

  it("grows with the amount rewritten and never exceeds 100", () => {
    const base = "abcdefghij";
    const small = editDepthPct(base, "abcdefghiJ!");
    const large = editDepthPct(base, "zyxwvutsrq");
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(100);
  });

  it("is 100 against an empty baseline rather than dividing by zero", () => {
    expect(editDepthPct("", "anything")).toBe(100);
  });
});

describe("prompt assembly", () => {
  it("adds the no-migration-language rule only for V1's dual-document destinations", () => {
    expect(antiHallucinationRules("AU")).toContain("NO-MIGRATION-LANGUAGE");
    expect(antiHallucinationRules("CA")).toContain("NO-MIGRATION-LANGUAGE");
    expect(antiHallucinationRules("UK")).not.toContain("NO-MIGRATION-LANGUAGE");
    expect(antiHallucinationRules("US")).not.toContain("NO-MIGRATION-LANGUAGE");
  });

  it("carries the destination limits, the guide and the student's own answers", () => {
    const prompt = buildSystemPrompt({
      countryCode: "AU",
      documentType: "visa_sop",
      limits: AU,
      complianceRules: { gte_statement_required: true },
      guide: {
        key_requirements: ["Demonstrate Genuine Temporary Entrant (GTE) intent"],
        dos: ["Reference specific course units"],
        donts: ["Do not imply intent to stay permanently"],
        common_refusal_reasons: ["Weak GTE evidence"],
        notes: "Subclass 500 student visa.",
      },
      profileSnapshot: { headline: "BSc Statistics" },
      answers: [
        { question_key: "career_plan", answer: "Lead a claims analytics team at home." },
        { question_key: "home_ties", answer: null },
      ],
    });

    expect(prompt).toContain("at least 500 words");
    expect(prompt).toContain("at most 1000 words");
    expect(prompt).toContain("gte_statement_required");
    expect(prompt).toContain("Genuine Temporary Entrant");
    expect(prompt).toContain("BSc Statistics");
    expect(prompt).toContain("Lead a claims analytics team at home.");
    // An unanswered question is stated as unanswered, never filled in for the student.
    expect(prompt).toContain("home_ties: (not answered)");
  });

  it("omits the guide section entirely when the destination has no guide row", () => {
    const prompt = buildSystemPrompt({
      countryCode: "NL",
      documentType: "university_sop",
      limits: { min_words: null, max_words: null, max_chars: null, banned_phrases: [] },
      complianceRules: {},
      guide: null,
      profileSnapshot: {},
      answers: [],
    });
    expect(prompt).not.toContain("## Destination Guide");
    // No limits configured → no length line invented.
    expect(prompt).not.toContain("Length:");
  });

  it("tells UCAS drafts about the character limit specifically", () => {
    expect(draftInstruction("ucas_statement")).toContain("character limit");
    expect(draftInstruction("visa_sop")).toContain("visa statement");
    expect(draftInstruction("university_sop")).toContain("university statement");
  });
});
