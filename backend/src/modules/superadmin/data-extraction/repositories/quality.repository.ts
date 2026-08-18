// Quality validator repository — staging reads and the flag writes.
//
// Flags live in superadmin.extraction_additional_info under key 'quality_flag',
// one row per issue with the payload as a JSON string. That is V1's exact shape,
// so anything already reading those rows keeps working.
//
// Column lists are explicit. `select *` on extraction_courses would drag every
// scraped column into an LLM prompt and an API response.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { CourseUnderAudit, QualityIssue } from "../lib/quality-rules.js";

export const QUALITY_FLAG_KEY = "quality_flag";

/** Exactly the fields the rules and the prompt use — nothing else leaves the table. */
const COURSE_COLUMNS = [
  "id",
  "name",
  "degree_level",
  "international_fee_total",
  "domestic_fee_total",
  "duration_weeks",
  "description",
  "source_url",
  "verification_status",
] as const;

export async function loadCourses(jobId: string, trx?: Knex): Promise<CourseUnderAudit[]> {
  const rows = await (trx ?? masterKnex)(`${S}.extraction_courses`)
    .where({ job_id: jobId })
    .orderBy("created_at", "asc")
    .select(...COURSE_COLUMNS);
  return rows as CourseUnderAudit[];
}

/** Fee-range context for the fee_anomaly rule. V1 reads the same two fields. */
export async function loadFeeContext(jobId: string) {
  return masterKnex(`${S}.extraction_site_intelligence`)
    .where({ job_id: jobId })
    .orderBy("created_at", "desc")
    .first("fee_structure", "currency", "institution_name");
}

/**
 * Replace this job's flags rather than V1's skip-if-any-exist.
 *
 * V1 aborts the whole check when a single quality_flag row already exists, which
 * means a job can never be re-validated after an operator fixes the data — the
 * stale flags are permanent. Replacing makes a re-run report the current state and
 * is still idempotent: same data in, same flags out.
 */
export async function replaceFlags(
  trx: Knex,
  jobId: string,
  issues: readonly QualityIssue[],
  courses: readonly CourseUnderAudit[],
): Promise<number> {
  await trx(`${S}.extraction_additional_info`).where({ job_id: jobId, key: QUALITY_FLAG_KEY }).del();
  if (!issues.length) return 0;

  const byId = new Map(courses.map((course) => [course.id, course]));
  const rows = issues.map((issue) => {
    const course = byId.get(issue.course_id);
    return {
      job_id: jobId,
      key: QUALITY_FLAG_KEY,
      value: JSON.stringify({
        course_id: issue.course_id,
        course_name: course?.name ?? null,
        issue_type: issue.issue_type,
        severity: issue.severity,
        suggestion: issue.suggestion,
      }),
      source_url: course?.source_url ?? null,
    };
  });

  const inserted = await trx(`${S}.extraction_additional_info`).insert(rows).returning("id");
  return inserted.length;
}

/**
 * Auto-flag the courses a high-severity issue names.
 *
 * `verification_status = 'unverified'` in the WHERE clause is V1's rule and it
 * matters: a course a human already marked verified must not be silently
 * downgraded by an audit run.
 */
export async function flagHighSeverity(
  trx: Knex,
  issues: readonly QualityIssue[],
): Promise<number> {
  const ids = [...new Set(issues.filter((issue) => issue.severity === "high").map((issue) => issue.course_id))];
  if (!ids.length) return 0;
  return trx(`${S}.extraction_courses`)
    .whereIn("id", ids)
    .where({ verification_status: "unverified" })
    .update({ verification_status: "flagged", updated_at: trx.fn.now() });
}

export async function listFlags(jobId: string) {
  const rows = await masterKnex(`${S}.extraction_additional_info`)
    .where({ job_id: jobId, key: QUALITY_FLAG_KEY })
    .orderBy("created_at", "asc")
    .select("id", "value", "source_url", "created_at");

  return rows.map((row) => ({
    id: row.id as string,
    source_url: row.source_url as string | null,
    created_at: row.created_at as Date,
    ...(safeParse(row.value) as Record<string, unknown>),
  }));
}

function safeParse(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return { suggestion: value };
  }
}
