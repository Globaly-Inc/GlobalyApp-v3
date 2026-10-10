// createService/updateService (institution-courses.repository.ts) used to always leave
// course_category at its "academic" default regardless of which service_category the caller
// actually picked — so a course filed under the "Short Courses" service_category still showed
// up under the Academic Courses list tab (course_category is a separate enum column driving
// that split). Backfills existing rows to match their service_category's slug now that create/
// update keep the two in sync going forward.

import type { Knex } from "knex";

const S = "superadmin";

export async function up(knex: Knex): Promise<void> {
  // Matches courseCategoryForSlug's rule exactly: only the real "courses" category counts as
  // academic, every OTHER service_category (Short Courses, Accommodation, or any other non-course
  // category) is a short_course. The original backfill matched slug='short_courses' only, so a
  // course filed under any other non-course category stayed mislabeled "academic" until edited.
  await knex.raw(`
    update ${S}.extraction_courses ec
    set course_category = 'short_course'
    from service_categories sc
    where sc.id = ec.service_category_id and sc.slug <> 'courses' and ec.course_category is distinct from 'short_course'
  `);
}

export async function down(): Promise<void> {
  // Not reversible — no record of which rows this changed vs. were already correct.
}
