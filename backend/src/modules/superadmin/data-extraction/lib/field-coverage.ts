// Per-job field fill rates as a job event, weakest first — written at the end of verification and
// again after the link step, so a thin job shows on its own timeline (2026-09-30 across all jobs:
// scholarships 1%, duration 32%, intakes 33%, fees 47%, eligibility 48%, units 50%). Counts only.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { writeJobEvent } from "./staging-writer.js";

export async function verifyFieldCoverage(jobId: string) {
  const has = (junction: string) =>
    `count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${S}.${junction} a WHERE a.course_id = c.id))::int`;
  const { rows } = await masterKnex.raw(
    `SELECT count(*)::int AS total,
            count(duration_weeks)::int AS duration,
            count(study_mode)::int AS study_mode,
            count(NULLIF(description, ''))::int AS description,
            ${has("extraction_course_fee_assignments")} AS fees,
            ${has("extraction_course_intake_assignments")} AS intakes,
            ${has("extraction_course_eligibility_assignments")} AS eligibility,
            ${has("extraction_course_study_unit_assignments")} AS units,
            ${has("extraction_course_campuses")} AS campus,
            ${has("extraction_course_scholarship_assignments")} AS scholarships
       FROM ${S}.extraction_courses c WHERE c.job_id = :jobId`,
    { jobId },
  );
  const { total, ...counts } = rows[0] as Record<string, number>;
  if (!total) return;
  const pct = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, Math.round((n / total) * 100)]));
  const ranked = Object.entries(pct).sort((a, b) => a[1] - b[1]);
  await writeJobEvent(jobId, "field_coverage_verified", {
    phase: "verification",
    message: `Field coverage over ${total} courses: ${ranked.map(([k, v]) => `${k} ${v}%`).join(", ")}`,
    data: { total, counts, pct },
  });
}
