// Data-shape verification: after extraction, does what we stored have the form the rest of the
// platform assumes? Each rule is an invariant the module's own docs already state, with the cost
// of breaking it — not a style preference. Measured on 2026-10-15 before writing any of this:
// 636 intakes with no year (invisible in EVERY public read), 497 fees with no amount, 108 priced
// fees with no currency, 8 English requirements with no test name (each emits a permanently-
// "unknown" eligibility criterion rendered as a tile labelled "Test").
//
// Two kinds of rule. A `where` rule counts rows of one table breaking a predicate. A `sql` rule
// brings its own count query — the "forked twin" detectors group rows (the same intake stored
// once WITH a year and once without, because the dedupe key treats NULL as a different value
// rather than as unknown), so a row predicate cannot express them.
//
// Severity is a REPORTING label for now, deliberately: blocking rules are the ones promote should
// eventually refuse on, but 636 yearless intakes are live today, so a hard gate on day one would
// freeze real publishes. Watch the counts first; wire the gate when the backlog is repaired.
//
// SQL strings here must never contain a literal `?` (a knex .raw binding marker — a regex with
// `?` is silently mangled and invents results; it cost a fake 91% defect rate on 2026-10-15).
// Only `:job` named bindings.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { writeJobEvent } from "./staging-writer.js";

const logger = createChildLogger("verification-rules");

export type RuleSeverity = "blocking" | "advisory";

export interface ShapeRule {
  id: string;
  severity: RuleSeverity;
  /** What is wrong and what it costs — shown to the admin on the timeline. */
  description: string;
  /** Row-count rule: table (job_id column assumed) + predicate over its columns. */
  table?: string;
  where?: string;
  /** Group rule: a full count query returning one row with column `n`; `:job` is bound. */
  sql?: string;
}

export const SHAPE_RULES: ShapeRule[] = [
  {
    id: "intake_no_year", severity: "blocking", table: "extraction_intakes",
    where: "intake_year IS NULL",
    description: "intake has no year — invisible in every public read (year gates visibility)",
  },
  {
    id: "intake_no_month", severity: "advisory", table: "extraction_intakes",
    where: "intake_month IS NULL",
    description: "intake has no month — silently ordered as January",
  },
  {
    id: "fee_no_amount", severity: "blocking", table: "extraction_course_fees",
    where: "total_amount IS NULL OR total_amount <= 0",
    description: "fee has no usable amount — a price tab entry that states no price",
  },
  {
    id: "fee_amount_no_currency", severity: "blocking", table: "extraction_course_fees",
    where: "total_amount IS NOT NULL AND total_amount > 0 AND (currency IS NULL OR trim(currency) = '')",
    description: "fee states an amount with no currency — unrenderable, and it forks a twin of the priced row",
  },
  {
    id: "english_no_test_name", severity: "blocking", table: "extraction_english_requirements",
    where: "test_type_name IS NULL OR trim(test_type_name) = ''",
    description: "English requirement with no test name — emits a permanently-unknown criterion, renders as 'Test'",
  },
  {
    id: "english_no_scores", severity: "advisory", table: "extraction_english_requirements",
    where: "overall_score IS NULL AND listening_score IS NULL AND reading_score IS NULL AND writing_score IS NULL AND speaking_score IS NULL",
    description: "English requirement with no scores at all",
  },
  {
    id: "eligibility_name_only", severity: "advisory", table: "extraction_eligibility_requirements",
    where: "description IS NULL OR trim(description) = ''",
    description: "requirement that states nothing but its name — the prompt bans these",
  },
  {
    id: "course_unlinked_level", severity: "advisory", table: "extraction_courses",
    where: "degree_level_code IS NULL",
    description: "course linked to no degree level — invisible to level filters",
  },
  {
    id: "course_unlinked_area", severity: "advisory", table: "extraction_courses",
    where: "subject_area_code IS NULL",
    description: "course linked to no subject area",
  },
  {
    id: "course_no_source_url", severity: "advisory", table: "extraction_courses",
    where: "source_url IS NULL OR trim(source_url) = ''",
    description: "course with no source page — the public card has nothing to link",
  },
  {
    id: "study_option_no_duration", severity: "advisory", table: "extraction_study_options",
    where: "duration_value IS NULL",
    description: "study option with no duration — and course duration derives from these",
  },
  // ── Forked twins: one real thing stored twice because a NULL key field read as "different" ──
  {
    id: "intake_forked_year", severity: "advisory",
    sql: `SELECT count(*) AS n FROM (
            SELECT 1 FROM ${S}.extraction_intakes WHERE job_id = :job
            GROUP BY lower(trim(intake_name))
            HAVING bool_or(intake_year IS NULL) AND bool_or(intake_year IS NOT NULL)) t`,
    description: "intake name stored both dated and undated — the undated twin shows as a duplicate",
  },
  {
    id: "fee_forked_currency", severity: "advisory",
    sql: `SELECT count(*) AS n FROM (
            SELECT 1 FROM ${S}.extraction_course_fees WHERE job_id = :job
            GROUP BY lower(trim(name)), total_amount
            HAVING bool_or(currency IS NULL OR trim(currency) = '')
               AND bool_or(currency IS NOT NULL AND trim(currency) <> '')) t`,
    description: "same fee stored with and without a currency — the dedupe key read NULL as a different value",
  },
  {
    id: "english_same_test_twice", severity: "advisory",
    sql: `SELECT count(*) AS n FROM (
            SELECT 1 FROM ${S}.extraction_english_requirements
            WHERE job_id = :job AND course_id IS NOT NULL AND test_type_name IS NOT NULL
            GROUP BY course_id, split_part(lower(trim(test_type_name)), ' ', 1)
            HAVING count(*) > 1) t`,
    description: "one course carries the same English test more than once — each copy re-weights English in the eligibility verdict",
  },
];

export interface ShapeReport {
  blocking: number;
  advisory: number;
  counts: Record<string, number>;
}

/** Count one rule for one job. Exported for the fixture test, which must be able to point each
 *  rule at a job seeded with exactly one bad and one good row. */
export async function countRule(rule: ShapeRule, jobId: string): Promise<number> {
  const sql = rule.sql ?? `SELECT count(*) AS n FROM ${S}.${rule.table} WHERE job_id = :job AND (${rule.where})`;
  const { rows } = await masterKnex.raw(sql, { job: jobId });
  return Number(rows[0]?.n ?? 0);
}

/**
 * Run every rule against one job and put the result on the timeline. Never throws — a shape
 * report must not fail a verification run. A rule that errors is REPORTED as errored, never
 * counted as zero: a broken check is indistinguishable from broken data in a count.
 */
export async function verifyDataShape(jobId: string): Promise<ShapeReport> {
  const counts: Record<string, number> = {};
  const errored: string[] = [];
  let blocking = 0;
  let advisory = 0;
  for (const rule of SHAPE_RULES) {
    try {
      const n = await countRule(rule, jobId);
      counts[rule.id] = n;
      if (rule.severity === "blocking") blocking += n;
      else advisory += n;
    } catch (err) {
      errored.push(rule.id);
      logger.warn("Shape rule failed to run", { jobId, rule: rule.id, err: String(err) });
    }
  }
  const worst = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  await writeJobEvent(jobId, "data_shape_verified", {
    phase: "verification",
    level: blocking > 0 || errored.length > 0 ? "warn" : "info",
    message: blocking + advisory === 0 && errored.length === 0
      ? "Data shape: every stored row has the form the platform reads"
      : `Data shape: ${blocking} blocking and ${advisory} advisory issue(s)`
        + (worst.length ? ` — worst: ${worst.map(([id, n]) => `${id} ${n}`).join(", ")}` : "")
        + (errored.length ? `; ${errored.length} rule(s) FAILED TO RUN (${errored.join(", ")})` : ""),
    data: { blocking, advisory, counts, errored },
  }).catch((err) => logger.warn("Could not write data_shape_verified", { jobId, err: String(err) }));
  return { blocking, advisory, counts };
}
