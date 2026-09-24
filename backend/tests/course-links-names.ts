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
  console.log("getCourseLinks course_name join tests (DB integration)\n");

  const { getCourseLinks } = await import("../src/modules/superadmin/data-extraction/repositories/courses.repository.js");

  const [jobRow] = await masterKnex("superadmin.extraction_jobs")
    .whereExists(
      masterKnex("superadmin.extraction_course_fee_assignments")
        .whereRaw("job_id = extraction_jobs.id"),
    )
    .limit(1);

  if (!jobRow) {
    console.log("No job with fee assignments in this DB — skipping (nothing to assert against).");
    console.log(`\n0 passed, 0 failed`);
    return;
  }

  const links = await getCourseLinks(jobRow.id);

  await assert("fee_assignments rows carry course_name matching the actual course", async () => {
    if (links.fee_assignments.length === 0) throw new Error("no fee_assignments to check");
    for (const row of links.fee_assignments) {
      const course = await masterKnex("superadmin.extraction_courses").where({ id: row.course_id }).first("name");
      eq(row.course_name, course?.name ?? null, `fee_assignment ${row.id}`);
    }
  });

  await assert("eligibility_assignments rows carry course_name", async () => {
    if (links.eligibility_assignments.length === 0) throw new Error("no eligibility_assignments to check");
    for (const row of links.eligibility_assignments) {
      const course = await masterKnex("superadmin.extraction_courses").where({ id: row.course_id }).first("name");
      eq(row.course_name, course?.name ?? null, `eligibility_assignment ${row.id}`);
    }
  });

  await assert("course_campuses (not a *_assignments key) is unaffected — no course_name added", async () => {
    if (links.course_campuses.length === 0) throw new Error("no course_campuses to check");
    eq("course_name" in links.course_campuses[0], false, "course_campuses row");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
