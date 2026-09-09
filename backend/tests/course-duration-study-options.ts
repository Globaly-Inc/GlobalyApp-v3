/**
 * Public course duration falls back to the linked study options — DB integration against the
 * real dev DB. Run: node --import tsx tests/course-duration-study-options.ts
 *
 * The bug: an admin sets "3 years" on a study option (Study Options tab) and the search card
 * still read "—", because the public query took ec.duration_weeks, which only an extraction run
 * fills. Style matches tests/course-sort.ts: real DB, no mocking of masterKnex.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import * as repo from "../src/modules/search/repositories/courses.repository.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const S = "superadmin";

/** The course as the search page sees it. */
async function durationOf(courseId: string) {
  const [row] = await repo.listPublicCourses({ courseIds: [courseId] }, undefined, 1, 0);
  if (!row) throw new Error("course not returned by listPublicCourses");
  return (row as { duration_weeks: number | null }).duration_weeks;
}

async function addOption(jobId: string, courseId: string, opt: { study_load: string; duration_value: number; duration_unit: string }) {
  const [o] = await masterKnex(`${S}.extraction_study_options`)
    .insert({ job_id: jobId, name: "test option", study_mode: "on_campus", ...opt })
    .returning("id");
  await masterKnex(`${S}.extraction_course_study_option_assignments`)
    .insert({ job_id: jobId, course_id: courseId, study_option_id: o.id });
  return o.id as string;
}

async function main() {
  console.log("Public course duration from study options (DB integration)\n");

  // Any publicly-visible course: the same predicate listPublicCourses enforces.
  const course = await masterKnex(`${S}.extraction_courses as ec`)
    .join("institutions as inst", (j) => j.on("inst.source_job_id", "ec.job_id").andOnVal("inst.is_published", true))
    .whereRaw(`exists (select 1 from ${S}.extraction_jobs ej where ej.id = ec.job_id and ej.status = 'exported')`)
    .whereRaw(repo.NOT_REJECTED)
    .select("ec.id", "ec.job_id", "ec.duration_weeks")
    .first();
  if (!course) {
    console.log("  no publicly-visible course in this DB — nothing to assert");
    return;
  }

  const optionIds: string[] = [];
  try {
    await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({ duration_weeks: null });

    optionIds.push(await addOption(course.job_id, course.id, { study_load: "part_time", duration_value: 4, duration_unit: "years" }));
    optionIds.push(await addOption(course.job_id, course.id, { study_load: "full_time", duration_value: 3, duration_unit: "years" }));

    await assert("shortest full-time option fills an empty course duration", async () => {
      eq(await durationOf(course.id), 156, "duration_weeks");
    });

    await assert("a derived duration is filterable and sortable", async () => {
      const [inBucket] = await repo.listPublicCourses({ courseIds: [course.id], duration: "105-208" }, "duration_asc", 1, 0);
      eq(Boolean(inBucket), true, "inside the 2–4 year bucket");
      const [outOfBucket] = await repo.listPublicCourses({ courseIds: [course.id], duration: "1-52" }, "duration_asc", 1, 0);
      eq(Boolean(outOfBucket), false, "outside the up-to-1-year bucket");
    });

    await assert("the course's own figure still wins", async () => {
      await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({ duration_weeks: 99 });
      eq(await durationOf(course.id), 99, "duration_weeks");
      await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({ duration_weeks: null });
    });

    await assert("an implausible option (40 years) is not a course length", async () => {
      await masterKnex(`${S}.extraction_study_options`).whereIn("id", optionIds).update({ duration_value: 40, duration_unit: "years" });
      eq(await durationOf(course.id), null, "duration_weeks");
    });
  } finally {
    await masterKnex(`${S}.extraction_course_study_option_assignments`).whereIn("study_option_id", optionIds).delete();
    await masterKnex(`${S}.extraction_study_options`).whereIn("id", optionIds).delete();
    await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({ duration_weeks: course.duration_weeks });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => masterKnex.destroy());
