// Final-batch quality audit — the deterministic three of V1's five rules.
//
// PORTED FROM (read, not copied): V1 process-extraction-queue's POST-EXTRACTION
// QUALITY VALIDATOR, which hands all five rules (duplicate, fee_anomaly,
// missing_required_fields, contradiction, nonsensical_name) to gpt-5-mini as a
// single `flag_quality_issues` tool call.
//
// WHY THREE OF THEM MOVED OUT OF THE PROMPT (§1.6 — legacy bugs are not the spec):
// "is this number below 4,231" and "do these two names differ only by a year" are
// not judgement calls. V1 asks a language model to do arithmetic and set
// comparison over a JSON blob of every course in the job, which is both
// non-reproducible (same batch, different flags next run) and silently
// truncation-sensitive — a long course list simply drops off the end of the
// prompt and those courses are never checked. Here they are computed in code, so
// they are exact, they run with no API key at all, and they cannot be truncated.
//
// The two that ARE judgement calls stay with the model: `contradiction` (does the
// name disagree with the degree level, allowing for legitimate pathway naming) and
// `nonsensical_name` (is this a course at all, or a blog post the crawler ate).
// Those two, and only those two, are what a missing key leaves pending.

export const QUALITY_ISSUE_TYPES = [
  "duplicate",
  "fee_anomaly",
  "missing_required_fields",
  "contradiction",
  "nonsensical_name",
] as const;

export type QualityIssueType = (typeof QUALITY_ISSUE_TYPES)[number];

export const QUALITY_SEVERITIES = ["low", "medium", "high"] as const;

export type QualitySeverity = (typeof QUALITY_SEVERITIES)[number];

export interface CourseUnderAudit {
  id: string;
  name: string;
  degree_level?: string | null;
  international_fee_total?: string | number | null;
  domestic_fee_total?: string | number | null;
  duration_weeks?: number | null;
  description?: string | null;
  source_url?: string | null;
}

export interface QualityIssue {
  course_id: string;
  issue_type: QualityIssueType;
  severity: QualitySeverity;
  suggestion: string;
}

/** V1's defaults, used when the job has no site-intelligence fee range. */
export const DEFAULT_FEE_BOUNDS = { min: 5000, max: 100_000, currency: "AUD" } as const;

export interface FeeBounds {
  min: number;
  max: number;
  currency: string;
}

/**
 * V1's widening: anything under 40% of the typical minimum or over 2.5× the
 * typical maximum is suspicious. Kept verbatim — the multipliers are the tuned
 * part, and a scraped fee really is usually wrong by a factor, not a margin.
 */
export function feeBoundsFrom(feeStructure: unknown, currency?: string | null): FeeBounds {
  const range = (feeStructure as { typical_intl_fee_range?: unknown } | null)?.typical_intl_fee_range;
  const bounds = { ...DEFAULT_FEE_BOUNDS, currency: currency || DEFAULT_FEE_BOUNDS.currency };

  if (!Array.isArray(range) || range.length !== 2) return bounds;
  const [low, high] = range.map(Number);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) return bounds;

  return { min: low * 0.4, max: high * 2.5, currency: bounds.currency };
}

/**
 * Strip everything V1's prompt calls a "minor" difference — a year, an intake
 * label, a campus suffix, bracketed asides, punctuation — so two spellings of one
 * course collapse to the same key.
 */
export function normaliseCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(intake|semester|term|trimester|sem)\s*\d*\b/g, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|ember|ober|tember)?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How much of a course row is actually filled in — V1 keeps "the most complete record". */
function completeness(course: CourseUnderAudit): number {
  const fields = [
    course.degree_level,
    course.international_fee_total,
    course.domestic_fee_total,
    course.duration_weeks,
    course.description,
    course.source_url,
  ];
  return fields.filter((value) => value != null && value !== "").length;
}

function amount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The three exact rules. Deterministic, order-independent, and reproducible: the
 * same batch always produces the same flags.
 */
export function findDeterministicIssues(
  courses: readonly CourseUnderAudit[],
  bounds: FeeBounds = DEFAULT_FEE_BOUNDS,
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // ── 1. duplicate ── near-identical names; the most complete record survives.
  const byName = new Map<string, CourseUnderAudit[]>();
  for (const course of courses) {
    const key = normaliseCourseName(course.name ?? "");
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(course);
    else byName.set(key, [course]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // Most complete wins; a tie keeps whichever was extracted first. Array.sort is
    // stable in Node, and the caller loads courses ordered by created_at, so input
    // order IS extraction order. Tie-breaking on uuid instead (the obvious thing)
    // makes the survivor random per run — two equally complete duplicates would flag
    // a different one of the pair every time the audit is re-run.
    const ordered = [...group].sort((a, b) => completeness(b) - completeness(a));
    const [keep, ...dups] = ordered;
    for (const dup of dups) {
      issues.push({
        course_id: dup.id,
        issue_type: "duplicate",
        severity: "high",
        suggestion: `Near-identical to "${keep.name}", which has more fields filled in. Keep that record and remove this one.`,
      });
    }
  }

  for (const course of courses) {
    // ── 2. fee_anomaly ── a fee that is present but off by a factor.
    for (const [label, raw] of [
      ["international", course.international_fee_total],
      ["domestic", course.domestic_fee_total],
    ] as const) {
      const fee = amount(raw);
      if (fee == null || fee === 0) continue;
      if (fee >= bounds.min && fee <= bounds.max) continue;
      const direction = fee < bounds.min ? "below" : "above";
      issues.push({
        course_id: course.id,
        issue_type: "fee_anomaly",
        severity: "medium",
        suggestion:
          `${label} fee ${round(fee)} ${bounds.currency} is ${direction} the plausible range ` +
          `${round(bounds.min)}–${round(bounds.max)} ${bounds.currency}. ` +
          (direction === "below"
            ? "Likely a per-semester figure scraped as a total."
            : "Likely a multi-year total or a scraping error."),
      });
    }

    // ── 3. missing_required_fields ── no fee AND no duration AND no real description.
    const hasFee = amount(course.international_fee_total) != null || amount(course.domestic_fee_total) != null;
    const hasDuration = course.duration_weeks != null;
    const description = (course.description ?? "").trim();
    if (!hasFee && !hasDuration && description.length < 30) {
      issues.push({
        course_id: course.id,
        issue_type: "missing_required_fields",
        severity: "low",
        suggestion: "No fee, no duration and no usable description — re-run the course_data step for this course.",
      });
    }
  }

  return issues;
}

/** A batch is flagged when anything at all came back. */
export function summarise(issues: readonly QualityIssue[]): string {
  if (!issues.length) return "No quality issues found";
  const counts = new Map<QualityIssueType, number>();
  for (const issue of issues) counts.set(issue.issue_type, (counts.get(issue.issue_type) ?? 0) + 1);
  const parts = QUALITY_ISSUE_TYPES.filter((type) => counts.has(type)).map(
    (type) => `${counts.get(type)} ${type}`,
  );
  return `${issues.length} issue(s): ${parts.join(", ")}`;
}

/**
 * Drop anything the model invented. V1 does the same check (`allCourses.find`)
 * before writing a flag — a hallucinated course_id must never reach the database.
 */
export function keepKnownCourses(
  issues: readonly QualityIssue[],
  courses: readonly CourseUnderAudit[],
): QualityIssue[] {
  const known = new Set(courses.map((course) => course.id));
  return issues.filter(
    (issue) =>
      known.has(issue.course_id) &&
      QUALITY_ISSUE_TYPES.includes(issue.issue_type) &&
      QUALITY_SEVERITIES.includes(issue.severity),
  );
}
