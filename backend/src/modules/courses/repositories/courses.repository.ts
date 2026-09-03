// Courses repository — read-only over superadmin.extraction_courses.
// Cross-schema reads follow the same pattern as enquiries.repository.ts's
// listForStudent (globalyapp and superadmin are schemas in one database).

import { masterKnex } from "../../../core/db/master-pool.js";

const T = "superadmin.extraction_courses";

export interface CourseListRow {
  id: string;
  job_id: string;
  name: string;
  short_name: string | null;
  degree_level: string | null;
  subject_area: string | null;
  duration_weeks: number | null;
  study_mode: string | null;
  country_code: string | null;
  domestic_fee_total: string | null;
  domestic_currency: string | null;
  international_fee_total: string | null;
  international_currency: string | null;
  awarding_institution: string | null;
  image_url: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
}

// Same visibility rule the public search page enforces, so the enquiry picker can
// never offer what neither list shows: the job was promoted (search/courses:
// PUBLICLY_VISIBLE) AND its institution row is published (search/institutions).
//
// ponytail: no verification_status filter — search/courses doesn't gate on it either
// (every extracted course is 'unverified' today, so it would return an empty list).
export const PUBLICLY_VISIBLE = `exists (
  select 1 from superadmin.extraction_jobs ej
  join institutions i on i.source_job_id = ej.id and i.is_published and i.deleted_at is null
  where ej.id = c.job_id and ej.status = 'exported'
)`;

export async function listCourses(opts: { limit: number; offset: number }): Promise<CourseListRow[]> {
  return masterKnex(`${T} as c`)
    .whereRaw(PUBLICLY_VISIBLE)
    // extraction_institution_overview has no unique index on job_id (it is 1:1
    // in practice, same assumption jobs.repository.ts makes). If the extractor
    // ever writes two overviews for one job this join would duplicate a course
    // row — add DISTINCT ON (c.id) or a unique index if that happens.
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "c.job_id")
    .select(
      "c.id",
      "c.job_id",
      "c.name",
      "c.short_name",
      "c.degree_level",
      "c.subject_area",
      "c.duration_weeks",
      "c.study_mode",
      "c.country_code",
      "c.domestic_fee_total",
      "c.domestic_currency",
      "c.international_fee_total",
      "c.international_currency",
      "c.awarding_institution",
      "c.image_url",
      "o.name as institution_name",
      "o.logo_url as institution_logo_url",
    )
    // Stable ordering so pagination can't repeat or skip rows.
    .orderBy("c.name", "asc")
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function countCourses(): Promise<number> {
  const [{ count }] = await masterKnex(`${T} as c`).whereRaw(PUBLICLY_VISIBLE).count("c.id as count");
  return Number(count);
}
