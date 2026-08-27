/**
 * course_category test — DB integration against the real dev DB.
 * Run: node --import tsx tests/course-category.ts
 *
 * Real bug: a job scoped to service_category_id="Academic Courses" still saved every
 * short course found on the same pages into the same extraction_courses rows, with no
 * per-course record of which was which. The LLM now classifies each course
 * ("academic" | "short_course") and writeCourse() stores that verdict per row instead of
 * trusting the job-level category for everything the pipeline finds.
 *
 * Style matches tests/rerun-agentcis.ts: real DB, no mocking of masterKnex.
 */

import { masterKnex } from "../src/core/db/master-pool.js";

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

async function insertJob(): Promise<string> {
  const [row] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: "Course Category Test Institution",
      institution_url: "https://course-category-test.example",
      status: "extracting",
    })
    .returning("id");
  return row.id as string;
}

async function main() {
  console.log("course_category write-path tests (DB integration)\n");

  const { writeCourse, normaliseCourseCategory } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");

  const jobIds: string[] = [];

  try {
    await assert("normaliseCourseCategory clamps recognised values and case/spacing variants", async () => {
      eq(normaliseCourseCategory("academic"), "academic");
      eq(normaliseCourseCategory("Academic"), "academic");
      eq(normaliseCourseCategory("short_course"), "short_course");
      eq(normaliseCourseCategory("Short Course"), "short_course");
      eq(normaliseCourseCategory("short-courses"), "short_course");
      eq(normaliseCourseCategory("vocational"), null, "unrecognised value");
      eq(normaliseCourseCategory(null), null, "null passthrough");
      eq(normaliseCourseCategory(undefined), null, "undefined passthrough");
    });

    await assert("writeCourse stores course_category on a new course", async () => {
      const jobId = await insertJob();
      jobIds.push(jobId);

      const courseId = await writeCourse(jobId, {
        name: "Aerospace Engineering BEng(Hons)",
        degree_level: "Bachelor",
        course_category: "academic",
      }, new Map());

      const row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, "academic", "course_category");
    });

    await assert("writeCourse stores short_course for a non-award offering", async () => {
      const jobId = await insertJob();
      jobIds.push(jobId);

      const courseId = await writeCourse(jobId, {
        name: "Introduction to Digital Marketing (6-week workshop)",
        course_category: "short_course",
      }, new Map());

      const row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, "short_course", "course_category");
    });

    await assert("writeCourse merges course_category into an existing row missing it, without overwriting a set value", async () => {
      const jobId = await insertJob();
      jobIds.push(jobId);

      const courseId = await writeCourse(jobId, { name: "Diploma of Business" }, new Map());
      let row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, null, "unset before merge");

      const mergedId = await writeCourse(jobId, { name: "Diploma of Business", course_category: "academic" }, new Map());
      eq(mergedId, courseId, "same course row, deduped by name");
      row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, "academic", "backfilled by merge");

      await writeCourse(jobId, { name: "Diploma of Business", course_category: "short_course" }, new Map());
      row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, "academic", "existing non-null value is not overwritten");
    });

    await assert("an unrecognised course_category string is stored as null, never guessed", async () => {
      const jobId = await insertJob();
      jobIds.push(jobId);

      const courseId = await writeCourse(jobId, {
        name: "Certificate IV in Community Services",
        course_category: "vocational certificate",
      }, new Map());

      const row = await masterKnex("superadmin.extraction_courses").where({ id: courseId }).first();
      eq(row.course_category, null, "course_category");
    });
  } finally {
    if (jobIds.length) await masterKnex("superadmin.extraction_jobs").whereIn("id", jobIds).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
