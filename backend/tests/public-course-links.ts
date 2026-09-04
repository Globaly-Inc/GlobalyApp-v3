// Check that the public course pages read a course's fees, intakes, units, options and campuses
// through the junction tables the admin curates — not job-wide, and not off the course row's own
// fee columns. Every one of those child tables also holds rows that belong to the job but NOT to
// this course (a superseded intake still carries `course_id`, a campus belongs to the whole
// institution), which is exactly how the search list and detail page came to show a zero fee,
// a dateless intake and eleven campuses for a course taught at three.
//
// Run with: npm run test:public-course-links
//
// Writes a throwaway extraction job to the real DB and deletes it again (one cascade off
// extraction_jobs), so it needs a database it may write to.

import "dotenv/config";
import assert from "node:assert/strict";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";
import {
  findPublicCourseBySlug,
  listPublicCourses,
  listCourseCampuses,
} from "../src/modules/search/repositories/courses.repository.js";

async function seed() {
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://example.test/public-course-links", status: "exported" })
    .returning("id");
  const jobId = job.id as string;

  const [course] = await masterKnex(`${S}.extraction_courses`)
    .insert({
      job_id: jobId,
      name: `Test Bachelor of Links ${Date.now()}`,
      degree_level: "bachelor",
      duration_weeks: 156,
      // Left null on purpose: the scraper fills the fee tables, not these columns.
      domestic_fee_total: null,
      international_fee_total: null,
    })
    .returning("id");
  const courseId = course.id as string;

  // Fees: one linked per audience, plus a linked-to-nobody row that must not surface.
  const feeRows = await masterKnex(`${S}.extraction_course_fees`)
    .insert([
      { job_id: jobId, name: "Domestic", student_type: "domestic", currency: "AUD", total_amount: 47388, period_type: "Per Year" },
      { job_id: jobId, name: "International", student_type: "international", currency: "AUD", total_amount: 96000 },
      { job_id: jobId, name: "Someone else's", student_type: "domestic", currency: "AUD", total_amount: 999999 },
    ])
    .returning(["id", "name"]);
  for (const fee of feeRows.filter((f: { name: string }) => f.name !== "Someone else's")) {
    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: jobId, course_id: courseId, course_fee_id: fee.id });
  }

  // Intakes: two linked, plus a superseded one that still points at the course (what a
  // re-extraction leaves behind) and must stay off the page.
  const intakeRows = await masterKnex(`${S}.extraction_intakes`)
    .insert([
      { job_id: jobId, course_id: courseId, intake_name: "Linked 2026", start_date: "2026-03-02", intake_month: 3, intake_year: 2026 },
      { job_id: jobId, course_id: courseId, intake_name: "Linked 2027", start_date: "2027-02-05", intake_month: 2, intake_year: 2027 },
      { job_id: jobId, course_id: courseId, intake_name: "Superseded", start_date: null, intake_month: null, intake_year: null },
    ])
    .returning(["id", "intake_name"]);
  for (const intake of intakeRows.filter((i: { intake_name: string }) => i.intake_name !== "Superseded")) {
    await masterKnex(`${S}.extraction_course_intake_assignments`)
      .insert({ job_id: jobId, course_id: courseId, intake_id: intake.id });
  }

  const [unit] = await masterKnex(`${S}.extraction_study_units`)
    .insert({ job_id: jobId, unit_code: "ACC127", unit_name: "Accounting and Financial Literacy", credit_points: 8 })
    .returning("id");
  const [otherUnit] = await masterKnex(`${S}.extraction_study_units`)
    .insert({ job_id: jobId, unit_code: "ZZZ999", unit_name: "Another course's unit" })
    .returning("id");
  await masterKnex(`${S}.extraction_course_study_unit_assignments`)
    .insert({ job_id: jobId, course_id: courseId, study_unit_id: unit.id });

  const [option] = await masterKnex(`${S}.extraction_study_options`)
    .insert({ job_id: jobId, name: "On campus, full time", study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" })
    .returning("id");
  await masterKnex(`${S}.extraction_course_study_option_assignments`)
    .insert({ job_id: jobId, course_id: courseId, study_option_id: option.id });

  // Campuses: the institution has five, the course is taught at three.
  const campusRows = await masterKnex(`${S}.extraction_campuses`)
    .insert(["Wagga Wagga", "Bathurst", "Port Macquarie", "Orange", "Wodonga"].map((city) => ({
      job_id: jobId, name: `${city} Campus`, city,
    })))
    .returning(["id", "city"]);
  const taughtAt = ["Wagga Wagga", "Bathurst", "Port Macquarie"];
  for (const campus of campusRows.filter((c: { city: string }) => taughtAt.includes(c.city))) {
    await masterKnex(`${S}.extraction_course_campuses`)
      .insert({ job_id: jobId, course_id: courseId, campus_id: campus.id, campus_name: `${campus.city} Campus` });
    // No unique constraint on (course, campus) — a double link must not double the card.
    await masterKnex(`${S}.extraction_course_campuses`)
      .insert({ job_id: jobId, course_id: courseId, campus_id: campus.id, campus_name: `${campus.city} Campus` });
  }

  return { jobId, courseId, taughtAt, unusedUnitId: otherUnit.id as string };
}

async function main() {
  const { jobId, courseId, taughtAt } = await seed();
  try {
    const course = await findPublicCourseBySlug(`test-bachelor-of-links-${courseId.replace(/-/g, "").slice(0, 6)}`);
    assert.ok(course, "the seeded course must be publicly visible (its job is 'exported')");

    // Fees — the curated rows, not the empty course columns.
    assert.equal(Number(course.domestic_fee_total), 47388, "domestic fee must come from the linked fee row");
    assert.equal(Number(course.international_fee_total), 96000, "international fee must come from the linked fee row");
    assert.equal(course.domestic_currency, "AUD");
    assert.equal(course.domestic_fee_period, "Per Year", "the page has to say what the amount covers");

    // Intakes — linked only, earliest first, with the dates the admin holds.
    assert.deepEqual(
      course.intakes.map((i: { intake_name: string }) => i.intake_name),
      ["Linked 2026", "Linked 2027"],
      "a superseded intake still carrying course_id must not show",
    );
    const firstStart = new Date(course.intakes[0].start_date as string);
    assert.equal(firstStart.getFullYear(), 2026, "the linked intake carries the start date the admin holds");
    assert.equal(firstStart.getMonth(), 2);

    assert.deepEqual(course.study_units.map((u: { unit_code: string }) => u.unit_code), ["ACC127"]);
    assert.deepEqual(course.study_options.map((o: { study_load: string }) => o.study_load), ["full_time"]);

    // Campuses — the three that teach it, each once.
    const campuses = await listCourseCampuses(courseId, jobId);
    assert.deepEqual(
      campuses.map((c: { city: string }) => c.city).sort(),
      [...taughtAt].sort(),
      "the page must list the campuses linked to the course, not every campus of the institution",
    );

    // A course with no campus links at all still shows the institution's campuses.
    await masterKnex(`${S}.extraction_course_campuses`).where({ course_id: courseId }).delete();
    assert.equal((await listCourseCampuses(courseId, jobId)).length, 5, "no links = fall back to the whole institution");

    // The search card reads the same figures as the detail page.
    const [card] = await listPublicCourses({ jobId }, undefined, 10, 0);
    assert.equal(Number(card.domestic_fee_total), 47388, "the search card must quote the linked fee");
    assert.equal(card.next_intake_year, 2026);
    assert.equal(card.next_intake_month, 3, "next intake comes from the linked intakes");

    // The budget filter runs off the same expression, so a fee it can't see is a course it drops.
    const inBudget = await listPublicCourses({ jobId, feeMin: 40000, feeMax: 50000 }, undefined, 10, 0);
    assert.equal(inBudget.length, 1, "a course whose fee lives only in the fee table must still be filterable");

    console.log(`ok — course ${courseId}: fees, intakes, units, options and campuses all read from its links`);
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).delete();
  }
  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("FAILED:", (err as Error).message);
  await masterKnex.destroy();
  process.exit(1);
});
