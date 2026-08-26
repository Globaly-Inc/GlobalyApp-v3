/**
 * Course list sort test — DB integration against the real dev DB.
 * Run: node --import tsx tests/course-sort.ts
 *
 * GET /jobs/:id/courses now accepts sort=newest|oldest|name_asc|name_desc. Default
 * ("oldest") must stay unchanged from the endpoint's original hardcoded created_at-asc
 * order for any caller that doesn't pass sort.
 *
 * Style matches tests/course-category.ts: real DB, no mocking of masterKnex.
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

async function main() {
  console.log("Course list sort tests (DB integration)\n");

  const { listCoursesByJob } = await import("../src/modules/superadmin/data-extraction/repositories/courses.repository.js");

  const [jobRow] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: "Course Sort Test Institution",
      institution_url: "https://course-sort-test.example",
      status: "extracting",
    })
    .returning("id");
  const jobId = jobRow.id as string;

  // Insert with created_at spread apart and names deliberately out of alphabetical/chronological
  // order, so a wrong sort key or wrong direction would show up as a mismatched sequence.
  const names = ["Zoology", "Aerospace Engineering", "Medicine"];
  for (let i = 0; i < names.length; i++) {
    await masterKnex("superadmin.extraction_courses").insert({
      job_id: jobId,
      name: names[i],
      created_at: masterKnex.raw(`now() - interval '${names.length - i} minutes'`),
    });
  }

  try {
    await assert("default (no sort passed) matches the original oldest-first order", async () => {
      const rows = await listCoursesByJob(jobId, 10, 0);
      eq(rows.map((r: any) => r.name).join(","), "Zoology,Aerospace Engineering,Medicine");
    });

    await assert("sort=oldest is explicit-equivalent to the default", async () => {
      const rows = await listCoursesByJob(jobId, 10, 0, {}, "oldest");
      eq(rows.map((r: any) => r.name).join(","), "Zoology,Aerospace Engineering,Medicine");
    });

    await assert("sort=newest reverses to most-recently-created first", async () => {
      const rows = await listCoursesByJob(jobId, 10, 0, {}, "newest");
      eq(rows.map((r: any) => r.name).join(","), "Medicine,Aerospace Engineering,Zoology");
    });

    await assert("sort=name_asc orders alphabetically A→Z", async () => {
      const rows = await listCoursesByJob(jobId, 10, 0, {}, "name_asc");
      eq(rows.map((r: any) => r.name).join(","), "Aerospace Engineering,Medicine,Zoology");
    });

    await assert("sort=name_desc orders alphabetically Z→A", async () => {
      const rows = await listCoursesByJob(jobId, 10, 0, {}, "name_desc");
      eq(rows.map((r: any) => r.name).join(","), "Zoology,Medicine,Aerospace Engineering");
    });
  } finally {
    await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
