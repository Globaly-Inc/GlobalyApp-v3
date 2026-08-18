// Wave G8 — the pure halves of the §3.4 extraction tail.
//
// Every expectation here comes from the reference implementation, not from the
// code under test:
//   * merge hashes  — V1 public.fee_match_hash / eligibility_match_hash
//   * merge grouping — V1 merge_business_duplicate_fees_and_eligibility
//   * quality rules  — V1 process-extraction-queue's flag_quality_issues criteria
//   * context bundle — V1 ingest-context's BUNDLE_SCHEMA and count/summary output

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  EMPTY_PLAN,
  eligibilityMatchHash,
  feeMatchHash,
  findOrphans,
  planMerge,
  type MergeableRow,
} from "../../src/modules/superadmin/data-extraction/lib/merge-duplicates.js";
import {
  DEFAULT_FEE_BOUNDS,
  feeBoundsFrom,
  findDeterministicIssues,
  keepKnownCourses,
  normaliseCourseName,
  summarise,
  type CourseUnderAudit,
} from "../../src/modules/superadmin/data-extraction/lib/quality-rules.js";
import {
  contextAddendum,
  countBundle,
  describeBundle,
  parseBundle,
  totalEntries,
} from "../../src/modules/superadmin/data-extraction/lib/context-bundle.js";

// ─────────────────────────────────────────────────────────────────────────────
// A. merge-duplicates
// ─────────────────────────────────────────────────────────────────────────────

describe("merge hashes match V1's SQL", () => {
  // V1: md5(coalesce(lower(btrim(_name)),'') || '|' || coalesce(_total_amount::text,'0') || '|' || coalesce(upper(btrim(_currency)),''))
  const sqlFeeHash = (name: string, total: string, currency: string) =>
    createHash("md5").update(`${name}|${total}|${currency}`).digest("hex");

  it("hashes a fee the way fee_match_hash() does", () => {
    expect(feeMatchHash({ name: "  Tuition ", total_amount: "31000.00", currency: " aud " })).toBe(
      sqlFeeHash("tuition", "31000.00", "AUD"),
    );
  });

  it("treats a null amount as '0' and a null name/currency as empty, like coalesce", () => {
    expect(feeMatchHash({ name: null, total_amount: null, currency: null })).toBe(sqlFeeHash("", "0", ""));
  });

  it("groups fees that differ only in case and padding", () => {
    expect(feeMatchHash({ name: "Tuition", total_amount: 500, currency: "AUD" })).toBe(
      feeMatchHash({ name: "tuition  ", total_amount: "500", currency: "aud" }),
    );
  });

  it("separates fees that differ in amount", () => {
    expect(feeMatchHash({ name: "Tuition", total_amount: 500, currency: "AUD" })).not.toBe(
      feeMatchHash({ name: "Tuition", total_amount: 501, currency: "AUD" }),
    );
  });

  it("hashes eligibility over degree level, score and both test arrays", () => {
    const same = eligibilityMatchHash({
      min_degree_level: "Bachelor",
      min_score_percent: "65",
      language_tests: [{ test: "IELTS", score: 6.5 }],
      academic_tests: [],
    });
    expect(
      eligibilityMatchHash({
        min_degree_level: "  bachelor ",
        min_score_percent: 65,
        language_tests: [{ test: "IELTS", score: 6.5 }],
        academic_tests: [],
      }),
    ).toBe(same);
    expect(
      eligibilityMatchHash({
        min_degree_level: "Bachelor",
        min_score_percent: "65",
        language_tests: [{ test: "IELTS", score: 7 }],
        academic_tests: [],
      }),
    ).not.toBe(same);
  });

  it("defaults an absent jsonb array to '[]', like coalesce(_language_tests::text,'[]')", () => {
    expect(eligibilityMatchHash({ min_degree_level: "Bachelor", min_score_percent: null })).toBe(
      eligibilityMatchHash({
        min_degree_level: "Bachelor",
        min_score_percent: null,
        language_tests: [],
        academic_tests: [],
      }),
    );
  });
});

describe("planMerge", () => {
  const row = (id: string, hash: string, serviceId: string | null, day: number): MergeableRow => ({
    id,
    hash,
    service_id: serviceId,
    created_at: new Date(Date.UTC(2026, 0, day)),
  });

  it("leaves a job with no duplicates completely alone", () => {
    const plan = planMerge([row("a", "h1", "s1", 1), row("b", "h2", "s2", 2)], []);
    expect(plan).toEqual(EMPTY_PLAN);
  });

  it("keeps the oldest row per hash and marks the rest for deletion (V1 ORDER BY created_at ASC)", () => {
    const plan = planMerge([row("young", "h", "s2", 5), row("old", "h", "s1", 1)], []);
    expect(plan.groups).toBe(1);
    expect(plan.merged).toBe(1);
    expect(plan.merges[0].keep_id).toBe("old");
    expect(plan.merges[0].dup_ids).toEqual(["young"]);
  });

  it("breaks a created_at tie on id, so the survivor is never luck", () => {
    const first = planMerge([row("bbb", "h", "s1", 1), row("aaa", "h", "s2", 1)], []);
    const reversed = planMerge([row("aaa", "h", "s2", 1), row("bbb", "h", "s1", 1)], []);
    expect(first.merges[0].keep_id).toBe("aaa");
    expect(reversed.merges[0].keep_id).toBe("aaa");
  });

  it("re-points the duplicate's owner service at the survivor", () => {
    const plan = planMerge([row("keep", "h", "s1", 1), row("dup", "h", "s2", 2)], []);
    expect(plan.merges[0].repoints).toEqual(["s2"]);
    expect(plan.merges[0].access_before).toEqual(["s1", "s2"]);
  });

  // The D8 defect. V1 re-points only dup_service_id; a service that reached the
  // duplicate through the junction loses it when the DELETE cascades.
  it("re-points services that reached a duplicate through a junction, not just its owner", () => {
    const plan = planMerge(
      [row("keep", "h", "s1", 1), row("dup", "h", "s2", 2)],
      [{ id: "j1", service_id: "s3", target_id: "dup" }],
    );
    expect(plan.merges[0].access_before).toEqual(["s1", "s2", "s3"]);
    expect(plan.merges[0].repoints).toEqual(["s2", "s3"]);
  });

  it("does not re-point a service that already has a junction to the survivor", () => {
    const plan = planMerge(
      [row("keep", "h", "s1", 1), row("dup", "h", "s2", 2)],
      [
        { id: "j1", service_id: "s3", target_id: "dup" },
        { id: "j2", service_id: "s3", target_id: "keep" },
      ],
    );
    expect(plan.merges[0].repoints).toEqual(["s2"]);
  });

  it("handles a shared row with no owning service (service_id NULL)", () => {
    const plan = planMerge(
      [row("keep", "h", null, 1), row("dup", "h", null, 2)],
      [
        { id: "j1", service_id: "s1", target_id: "keep" },
        { id: "j2", service_id: "s2", target_id: "dup" },
      ],
    );
    expect(plan.merges[0].access_before).toEqual(["s1", "s2"]);
    expect(plan.merges[0].repoints).toEqual(["s2"]);
  });

  it("merges a group of three down to one", () => {
    const plan = planMerge([row("a", "h", "s1", 1), row("b", "h", "s2", 2), row("c", "h", "s3", 3)], []);
    expect(plan.merged).toBe(2);
    expect(plan.merges[0].dup_ids.sort()).toEqual(["b", "c"]);
    expect(plan.merges[0].repoints).toEqual(["s2", "s3"]);
  });

  it("reports every hash group independently", () => {
    const plan = planMerge(
      [row("a", "h1", "s1", 1), row("b", "h1", "s2", 2), row("c", "h2", "s1", 1), row("d", "h2", "s3", 2)],
      [],
    );
    expect(plan.groups).toBe(2);
    expect(plan.merged).toBe(2);
  });
});

describe("findOrphans — the guard defect D8 exists for", () => {
  const plan = planMerge(
    [
      { id: "keep", hash: "h", service_id: "s1", created_at: new Date(Date.UTC(2026, 0, 1)) },
      { id: "dup", hash: "h", service_id: "s2", created_at: new Date(Date.UTC(2026, 0, 2)) },
    ],
    [{ id: "j1", service_id: "s3", target_id: "dup" }],
  );

  it("is silent when every service that had access still has it", () => {
    expect(findOrphans(plan, new Map([["keep", ["s1", "s2", "s3"]]]))).toEqual([]);
  });

  it("names the services that lost access", () => {
    expect(findOrphans(plan, new Map([["keep", ["s1", "s2"]]]))).toEqual([
      { keep_id: "keep", lost: ["s3"] },
    ]);
  });

  it("treats a survivor with no rows at all as everything orphaned", () => {
    expect(findOrphans(plan, new Map())).toEqual([{ keep_id: "keep", lost: ["s1", "s2", "s3"] }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. quality validator — deterministic rules
// ─────────────────────────────────────────────────────────────────────────────

const course = (over: Partial<CourseUnderAudit> & { id: string; name: string }): CourseUnderAudit => ({
  degree_level: "Bachelor",
  international_fee_total: 30_000,
  duration_weeks: 156,
  description: "A three year undergraduate degree in a named discipline.",
  ...over,
});

describe("feeBoundsFrom", () => {
  it("falls back to V1's 5,000–100,000 AUD default with no site intelligence", () => {
    expect(feeBoundsFrom(null, null)).toEqual(DEFAULT_FEE_BOUNDS);
  });

  it("keeps the job currency even without a range", () => {
    expect(feeBoundsFrom({}, "GBP")).toEqual({ ...DEFAULT_FEE_BOUNDS, currency: "GBP" });
  });

  it("widens a typical range by V1's 0.4x / 2.5x", () => {
    expect(feeBoundsFrom({ typical_intl_fee_range: [20_000, 40_000] }, "AUD")).toEqual({
      min: 8_000,
      max: 100_000,
      currency: "AUD",
    });
  });

  it("ignores a malformed or inverted range rather than trusting it", () => {
    expect(feeBoundsFrom({ typical_intl_fee_range: [40_000] }, "AUD")).toEqual(DEFAULT_FEE_BOUNDS);
    expect(feeBoundsFrom({ typical_intl_fee_range: [40_000, 10_000] }, "AUD")).toEqual(DEFAULT_FEE_BOUNDS);
    expect(feeBoundsFrom({ typical_intl_fee_range: ["a", "b"] }, "AUD")).toEqual(DEFAULT_FEE_BOUNDS);
  });
});

describe("normaliseCourseName", () => {
  it("collapses a year, an intake label and bracketed asides", () => {
    expect(normaliseCourseName("Bachelor of Nursing (Sydney) 2026 — Semester 1")).toBe("bachelor of nursing");
    expect(normaliseCourseName("Bachelor of Nursing")).toBe("bachelor of nursing");
  });

  it("keeps genuinely different courses apart", () => {
    expect(normaliseCourseName("Bachelor of Nursing")).not.toBe(normaliseCourseName("Master of Nursing"));
  });
});

describe("findDeterministicIssues", () => {
  it("passes a clean batch with no flags at all", () => {
    expect(findDeterministicIssues([course({ id: "1", name: "Bachelor of Nursing" })])).toEqual([]);
  });

  it("flags near-identical names as duplicates and keeps the most complete record", () => {
    const issues = findDeterministicIssues([
      course({ id: "full", name: "Bachelor of Nursing" }),
      course({
        id: "thin",
        name: "Bachelor of Nursing 2026 (Intake 2)",
        international_fee_total: null,
        duration_weeks: null,
        description: null,
        degree_level: null,
      }),
    ]);
    const duplicates = issues.filter((i) => i.issue_type === "duplicate");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].course_id).toBe("thin");
    expect(duplicates[0].severity).toBe("high");
  });

  it("flags a fee below the plausible floor as a medium fee_anomaly", () => {
    const issues = findDeterministicIssues([
      course({ id: "1", name: "Bachelor of Nursing", international_fee_total: 900 }),
    ]);
    expect(issues.filter((i) => i.issue_type === "fee_anomaly")).toMatchObject([
      { course_id: "1", severity: "medium" },
    ]);
  });

  it("flags a fee above the plausible ceiling", () => {
    const issues = findDeterministicIssues([
      course({ id: "1", name: "Bachelor of Nursing", international_fee_total: 4_000_000 }),
    ]);
    expect(issues.some((i) => i.issue_type === "fee_anomaly")).toBe(true);
  });

  it("respects a narrowed range from site intelligence", () => {
    const tight = feeBoundsFrom({ typical_intl_fee_range: [30_000, 40_000] }, "AUD"); // 12,000–100,000
    const rows = [course({ id: "1", name: "Bachelor of Nursing", international_fee_total: 9_000 })];
    expect(findDeterministicIssues(rows, tight).some((i) => i.issue_type === "fee_anomaly")).toBe(true);
    expect(findDeterministicIssues(rows).some((i) => i.issue_type === "fee_anomaly")).toBe(false);
  });

  it("checks the domestic fee as well as the international one", () => {
    const issues = findDeterministicIssues([
      course({ id: "1", name: "Bachelor of Nursing", international_fee_total: null, domestic_fee_total: 12 }),
    ]);
    expect(issues.filter((i) => i.issue_type === "fee_anomaly")).toHaveLength(1);
  });

  it("does not flag a fee that is simply absent", () => {
    const issues = findDeterministicIssues([
      course({ id: "1", name: "Bachelor of Nursing", international_fee_total: null, domestic_fee_total: null }),
    ]);
    expect(issues.some((i) => i.issue_type === "fee_anomaly")).toBe(false);
  });

  it("flags a row with no fee AND no duration AND no real description, at low severity", () => {
    const issues = findDeterministicIssues([
      course({
        id: "1",
        name: "Bachelor of Nursing",
        international_fee_total: null,
        domestic_fee_total: null,
        duration_weeks: null,
        description: "Apply now",
      }),
    ]);
    expect(issues.filter((i) => i.issue_type === "missing_required_fields")).toMatchObject([
      { course_id: "1", severity: "low" },
    ]);
  });

  it("does not flag a thin row that still has a duration (V1 requires all three to be absent)", () => {
    const issues = findDeterministicIssues([
      course({
        id: "1",
        name: "Bachelor of Nursing",
        international_fee_total: null,
        domestic_fee_total: null,
        duration_weeks: 52,
        description: null,
      }),
    ]);
    expect(issues.some((i) => i.issue_type === "missing_required_fields")).toBe(false);
  });

  it("is reproducible — the same batch in a different order flags the same courses", () => {
    const rows = [
      course({ id: "a", name: "Bachelor of Nursing" }),
      course({ id: "b", name: "Bachelor of Nursing 2027", description: null, duration_weeks: null, international_fee_total: null, domestic_fee_total: null }),
      course({ id: "c", name: "Diploma of Cookery", international_fee_total: 3 }),
    ];
    const key = (rows: CourseUnderAudit[]) =>
      findDeterministicIssues(rows)
        .map((i) => `${i.course_id}:${i.issue_type}`)
        .sort()
        .join(",");
    expect(key([...rows].reverse())).toBe(key(rows));
  });
});

describe("summarise / keepKnownCourses", () => {
  it("says so plainly when a batch is clean", () => {
    expect(summarise([])).toBe("No quality issues found");
  });

  it("counts by issue type", () => {
    expect(
      summarise([
        { course_id: "1", issue_type: "duplicate", severity: "high", suggestion: "" },
        { course_id: "2", issue_type: "duplicate", severity: "high", suggestion: "" },
        { course_id: "3", issue_type: "fee_anomaly", severity: "medium", suggestion: "" },
      ]),
    ).toBe("3 issue(s): 2 duplicate, 1 fee_anomaly");
  });

  it("drops a hallucinated course_id before it can reach the database", () => {
    const courses = [course({ id: "real", name: "Bachelor of Nursing" })];
    expect(
      keepKnownCourses(
        [
          { course_id: "real", issue_type: "nonsensical_name", severity: "high", suggestion: "x" },
          { course_id: "invented", issue_type: "nonsensical_name", severity: "high", suggestion: "x" },
        ],
        courses,
      ),
    ).toHaveLength(1);
  });

  it("drops an issue_type or severity outside the enum", () => {
    const courses = [course({ id: "real", name: "Bachelor of Nursing" })];
    expect(
      keepKnownCourses(
        [
          { course_id: "real", issue_type: "vibes" as never, severity: "high", suggestion: "x" },
          { course_id: "real", issue_type: "contradiction", severity: "catastrophic" as never, suggestion: "x" },
        ],
        courses,
      ),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. context bundle
// ─────────────────────────────────────────────────────────────────────────────

describe("parseBundle", () => {
  it("accepts V1's BUNDLE_SCHEMA shape", () => {
    const bundle = parseBundle({
      institution: { name: "Acme College", country: "Australia" },
      courses: [{ name: "Bachelor of Nursing", degree_level: "Bachelor" }],
      fees: [{ fee_type: "Tuition", amount: 31000, currency: "AUD", period: "year", applies_to_courses: ["Bachelor of Nursing"] }],
      units: [{ name: "Anatomy", credits: 12 }],
    });
    expect(countBundle(bundle!)).toMatchObject({ institution: 1, courses: 1, fees: 1, units: 1 });
  });

  it("returns null for a bundle with nothing in it", () => {
    expect(parseBundle({})).toBeNull();
    expect(parseBundle({ courses: [] })).toBeNull();
    expect(parseBundle(null)).toBeNull();
    expect(parseBundle("not an object")).toBeNull();
  });

  it("keeps the good entries and discards the bad ones rather than failing the run", () => {
    const bundle = parseBundle({
      courses: [{ name: "Bachelor of Nursing" }, { code: "NO-NAME" }],
    });
    expect(bundle?.courses).toHaveLength(1);
  });

  it("coerces a numeric field the model returned as a string", () => {
    const bundle = parseBundle({ fees: [{ fee_type: "Tuition", amount: "31000" }] });
    expect(bundle?.fees?.[0].amount).toBe(31000);
  });

  it("drops unknown keys instead of storing them", () => {
    const bundle = parseBundle({ courses: [{ name: "X" }], nonsense: [{ a: 1 }] });
    expect(bundle).not.toHaveProperty("nonsense");
  });
});

describe("bundle counts and summary", () => {
  it("reports V1's one-line summary", () => {
    const bundle = parseBundle({
      courses: [{ name: "A" }, { name: "B" }],
      fees: [{ fee_type: "Tuition" }],
      intakes: [{ month: "February" }],
      eligibility: [{ requirement_type: "academic" }],
      units: [{ name: "U" }],
    })!;
    expect(describeBundle(countBundle(bundle), 3)).toBe(
      "Parsed 3 document(s): 2 courses, 1 fees, 1 intakes, 1 eligibility rules, 1 units",
    );
  });

  it("totals every kind of entry", () => {
    expect(totalEntries(countBundle(parseBundle({ courses: [{ name: "A" }], units: [{ name: "U" }] })!))).toBe(2);
  });
});

describe("contextAddendum", () => {
  it("is empty with no bundle, so a job without documents changes no prompt", () => {
    expect(contextAddendum(null)).toBe("");
  });

  it("tells the model to prefer the documents over the scrape", () => {
    const addendum = contextAddendum(parseBundle({ courses: [{ name: "Bachelor of Nursing" }] }));
    expect(addendum).toContain("VERIFIED CONTEXT");
    expect(addendum).toContain("Bachelor of Nursing");
  });

  it("truncates rather than blowing the prompt budget", () => {
    const many = { courses: Array.from({ length: 400 }, (_, i) => ({ name: `Course number ${i}` })) };
    const addendum = contextAddendum(parseBundle(many), 500);
    expect(addendum).toContain("[truncated]");
    expect(addendum.length).toBeLessThan(800);
  });
});
