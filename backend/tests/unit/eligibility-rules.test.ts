// The eligibility rule engine — a straight port of V1's `check-eligibility` edge
// function (supabase/functions/check-eligibility/index.ts).
//
// WHERE THE RULES ACTUALLY LIVE IN V1, since three candidates were on the table:
//   - NOT in the client. `useVisaEligibilityMatch.ts` scores VISAS against a
//     profile and never touches `eligibility_checks`; StudentEligibility.tsx only
//     POSTs to the function and renders the stored met/unmet arrays.
//   - NOT in a Postgres RPC. The only RPC the function calls is `deduct_credits`.
//   - IN the edge function, reading `business_services.category_specific_data`
//     (min_degree_level, min_gpa, english_test_required, min_ielts/toefl/pte/
//     duolingo) plus the service's price and the student's profile.
// So this file asserts V1's five rules and V1's three-way verdict, nothing more.
// No score is invented: V1 has no score, and neither does V3.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEGREE_ORDER, ELIGIBILITY_RESULTS } from "../../src/modules/eligibility/consts.js";
import { evaluate, type EligibilityProfile, type EligibilityService } from "../../src/modules/eligibility/lib/rules.js";

const profile = (over: Partial<EligibilityProfile> = {}): EligibilityProfile => ({
  highest_degree_level: null,
  gpa: null,
  english_test_type: null,
  english_test_score: null,
  budget_max: null,
  preferred_destination_ids: [],
  ...over,
});

const service = (over: Partial<EligibilityService> = {}): EligibilityService => ({
  price: null,
  price_currency: null,
  country_id: null,
  country_name: null,
  requirements: {},
  ...over,
});

describe("eligibility rules — V1 parity", () => {
  it("with no requirements at all, is eligible and says English is not required", () => {
    const r = evaluate(profile(), service());
    expect(r.result).toBe("eligible");
    expect(r.met_requirements).toEqual(["No English language test required for this service"]);
    expect(r.unmet_requirements).toEqual([]);
    expect(r.notes).toBe("You meet all the requirements. You can proceed with your application!");
  });

  // ── 1. minimum degree level ───────────────────────────────────────────────

  it("ranks degree levels by V1's ordered list, not alphabetically", () => {
    expect(DEGREE_ORDER.indexOf("bachelor")).toBeLessThan(DEGREE_ORDER.indexOf("master"));
    const r = evaluate(
      profile({ highest_degree_level: "master" }),
      service({ requirements: { min_degree_level: "bachelor" } }),
    );
    expect(r.met_requirements).toContain("Degree level: master meets requirement of bachelor");
    expect(r.result).toBe("eligible");
  });

  it("is not eligible when the student's degree ranks below the requirement", () => {
    const r = evaluate(
      profile({ highest_degree_level: "diploma" }),
      service({ requirements: { min_degree_level: "master" } }),
    );
    expect(r.unmet_requirements).toContain("Minimum degree level: master (you have: diploma)");
    expect(r.result).toBe("not_eligible");
  });

  it("underscores become spaces in the requirement label, as V1 rendered them", () => {
    const r = evaluate(
      profile({ highest_degree_level: "graduate_certificate" }),
      service({ requirements: { min_degree_level: "graduate_diploma" } }),
    );
    expect(r.unmet_requirements).toContain(
      "Minimum degree level: graduate diploma (you have: graduate certificate)",
    );
  });

  it("an unset degree level is unmet, not conditional", () => {
    const r = evaluate(profile(), service({ requirements: { min_degree_level: "bachelor" } }));
    expect(r.unmet_requirements).toContain("Minimum degree level: bachelor (your degree level is not set)");
    expect(r.result).toBe("not_eligible");
  });

  it("a degree level V1's list does not know ranks -1, so it is unmet", () => {
    const r = evaluate(
      profile({ highest_degree_level: "wizardry" }),
      service({ requirements: { min_degree_level: "bachelor" } }),
    );
    expect(r.unmet_requirements[0]).toContain("your degree level is not set");
  });

  // ── 2. minimum GPA ────────────────────────────────────────────────────────

  it("a met GPA is a met requirement", () => {
    const r = evaluate(profile({ gpa: 3.5 }), service({ requirements: { min_gpa: 3 } }));
    expect(r.met_requirements).toContain("GPA: 3.5 meets minimum of 3");
    expect(r.result).toBe("eligible");
  });

  it("a low GPA is unmet", () => {
    const r = evaluate(profile({ gpa: 2 }), service({ requirements: { min_gpa: 3 } }));
    expect(r.unmet_requirements).toContain("Minimum GPA: 3 (your GPA: 2)");
    expect(r.result).toBe("not_eligible");
  });

  it("an ABSENT GPA against a GPA requirement is CONDITIONAL, not unmet — V1's one soft rule", () => {
    const r = evaluate(profile(), service({ requirements: { min_gpa: 3 } }));
    expect(r.result).toBe("conditionally_eligible");
    expect(r.unmet_requirements).toContain("GPA requirement: 3 (your GPA is not set - add it to your profile)");
    expect(r.notes).toBe("You meet the core requirements but there are some items to consider before applying.");
  });

  // ── 3. English language ───────────────────────────────────────────────────

  it("requires a test score when english_test_required and the profile has none", () => {
    const r = evaluate(profile(), service({ requirements: { english_test_required: true } }));
    expect(r.unmet_requirements).toEqual(["English language test score required (IELTS/TOEFL/PTE/Duolingo)"]);
    expect(r.notes).toBe("You do not currently meet 1 requirement(s).");
  });

  it("a score with no test type is still a missing test", () => {
    const r = evaluate(
      profile({ english_test_score: 7 }),
      service({ requirements: { english_test_required: true } }),
    );
    expect(r.unmet_requirements[0]).toContain("English language test score required");
  });

  it.each([
    ["ielts", "IELTS", "min_ielts", 6.5, 7, true],
    ["toefl", "TOEFL", "min_toefl", 90, 80, false],
    ["pte", "PTE", "min_pte", 58, 65, true],
    ["duolingo", "DUOLINGO", "min_duolingo", 120, 110, false],
  ] as const)("compares %s against its own minimum", (_l, type, key, min, score, passes) => {
    const r = evaluate(
      profile({ english_test_type: type.toLowerCase(), english_test_score: score }),
      service({ requirements: { english_test_required: true, [key]: min } }),
    );
    const line = `English test: ${type} ${score} (minimum: ${min})`;
    expect(passes ? r.met_requirements : r.unmet_requirements).toContain(line);
  });

  it("an English test V1's four keys do not cover passes, rather than failing the student", () => {
    const r = evaluate(
      profile({ english_test_type: "cambridge", english_test_score: 185 }),
      service({ requirements: { english_test_required: true, min_ielts: 9 } }),
    );
    expect(r.met_requirements).toContain(
      "English test: CAMBRIDGE score: 185 (no specific minimum set for CAMBRIDGE)",
    );
    expect(r.result).toBe("eligible");
  });

  it("a test type with no minimum set passes, as V1 did", () => {
    const r = evaluate(
      profile({ english_test_type: "ielts", english_test_score: 5 }),
      service({ requirements: { english_test_required: true, min_toefl: 90 } }),
    );
    expect(r.met_requirements).toContain("English test: IELTS score: 5 (no specific minimum set for IELTS)");
    expect(r.result).toBe("eligible");
  });

  // ── 4. budget ─────────────────────────────────────────────────────────────

  it("a fee within budget is met, with the currency V1 defaulted to", () => {
    const r = evaluate(profile({ budget_max: 50000 }), service({ price: 30000 }));
    expect(r.met_requirements).toContain("Budget: AUD 30,000 is within your budget");
  });

  it("a fee over budget is CONDITIONAL, never a hard fail", () => {
    const r = evaluate(
      profile({ budget_max: 10000 }),
      service({ price: 30000, price_currency: "USD" }),
    );
    expect(r.result).toBe("conditionally_eligible");
    expect(r.unmet_requirements).toContain(
      "Budget: Fee USD 30,000 may exceed your stated budget of USD 10,000",
    );
  });

  it("skips the budget rule entirely when either side is unset", () => {
    expect(evaluate(profile({ budget_max: 10000 }), service()).unmet_requirements).toEqual([]);
    expect(evaluate(profile(), service({ price: 30000 })).unmet_requirements).toEqual([]);
  });

  // ── 5. destination preference ─────────────────────────────────────────────

  it("names the country when it is one of the student's preferred destinations", () => {
    const r = evaluate(
      profile({ preferred_destination_ids: [12, 31] }),
      service({ country_id: 31, country_name: "Australia" }),
    );
    expect(r.met_requirements).toContain("Australia is one of your preferred destinations");
  });

  it("falls back to the country id when the join produced no name", () => {
    const r = evaluate(
      profile({ preferred_destination_ids: [31] }),
      service({ country_id: 31, country_name: null }),
    );
    expect(r.met_requirements).toContain("31 is one of your preferred destinations");
  });

  it("adds nothing when the country is not preferred — V1 never penalised it", () => {
    const r = evaluate(
      profile({ preferred_destination_ids: [12] }),
      service({ country_id: 31, country_name: "Australia" }),
    );
    expect(r.met_requirements.join()).not.toContain("Australia");
    expect(r.result).toBe("eligible");
  });

  it("skips the rule when the service has no country or the student no preferences", () => {
    expect(
      evaluate(profile({ preferred_destination_ids: [31] }), service()).met_requirements.join(),
    ).not.toContain("preferred");
    expect(
      evaluate(profile(), service({ country_id: 31, country_name: "Australia" })).met_requirements.join(),
    ).not.toContain("preferred");
  });

  // ── the verdict ───────────────────────────────────────────────────────────

  it("a hard fail outranks a conditional flag, and both land in unmet_requirements", () => {
    const r = evaluate(
      profile({ budget_max: 1 }),
      service({ price: 30000, requirements: { english_test_required: true } }),
    );
    expect(r.result).toBe("not_eligible");
    // V1 stored [...unmet, ...conditional] in the one column, hard fails first.
    expect(r.unmet_requirements[0]).toContain("English language test score required");
    expect(r.unmet_requirements[1]).toContain("may exceed your stated budget");
    expect(r.notes).toBe("You do not currently meet 1 requirement(s).");
  });

  it("survives a category_specific_data blob that is null or the wrong shape", () => {
    for (const requirements of [null, undefined, "nonsense", 42, []] as unknown[]) {
      const r = evaluate(profile(), service({ requirements: requirements as never }));
      expect(r.result).toBe("eligible");
    }
  });

  it("ignores a non-numeric min_gpa rather than comparing against NaN", () => {
    const r = evaluate(profile({ gpa: 2 }), service({ requirements: { min_gpa: "three" } }));
    expect(r.result).toBe("eligible");
  });

  it("reproduces the three real V1 rows: no English test on file, one unmet requirement", () => {
    const r = evaluate(profile(), service({ requirements: { english_test_required: true } }));
    expect(r).toMatchObject({
      result: "not_eligible",
      met_requirements: [],
      unmet_requirements: ["English language test score required (IELTS/TOEFL/PTE/Duolingo)"],
      notes: "You do not currently meet 1 requirement(s).",
    });
  });
});

describe("the vocabulary is declared once", () => {
  // consts.ts is the source, and the migration restates the three values in a CHECK
  // constraint because a CHECK cannot import TypeScript. Two copies of a closed
  // vocabulary drift, so this is the check that they have not.
  it("the migration's CHECK constraint lists exactly ELIGIBILITY_RESULTS", () => {
    const migration = readFileSync(
      new URL("../../database/migrations/globalyapp/20260818_350_student_eligibility_checks.ts", import.meta.url),
      "utf8",
    );
    const declared = migration.match(/const RESULTS = \[([^\]]+)\]/)?.[1];
    expect(declared).toBeDefined();
    const values = [...declared!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...ELIGIBILITY_RESULTS]);
  });

  it("every degree level is spelled in snake_case, since the label renderer assumes it", () => {
    for (const level of DEGREE_ORDER) expect(level).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
