/**
 * Pagination + search test for the newly paginated list endpoints — eligibility
 * requirements, intakes, agents, and campuses — all previously only available as full,
 * unpaginated dumps (course-links bundle or a bare full-table SELECT).
 * Run: node --import tsx tests/entity-list-pagination.ts
 *
 * Style matches tests/course-sort.ts: real DB, no mocking of masterKnex.
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
  console.log("Entity list pagination + search tests (DB integration)\n");

  const courses = await import("../src/modules/superadmin/data-extraction/repositories/courses.repository.js");
  const review = await import("../src/modules/superadmin/data-extraction/repositories/review.repository.js");

  const [jobRow] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: "Entity List Pagination Test Institution",
      institution_url: "https://entity-list-pagination-test.example",
      status: "extracting",
    })
    .returning("id");
  const jobId = jobRow.id as string;

  try {
    await assert("eligibility requirements: search filters by name, count matches", async () => {
      await masterKnex("superadmin.extraction_eligibility_requirements").insert([
        { job_id: jobId, name: "Standard Academic Entry" },
        { job_id: jobId, name: "English Proficiency" },
      ]);
      const all = await courses.listEligibilityByJob(jobId, 10, 0);
      eq(all.length, 2, "unfiltered count");
      const filtered = await courses.listEligibilityByJob(jobId, 10, 0, { search: "english" });
      eq(filtered.length, 1, "filtered rows");
      eq(filtered[0].name, "English Proficiency");
      eq(await courses.countEligibilityByJob(jobId, { search: "english" }), 1, "filtered count");
    });

    await assert("intakes: search filters by intake_name, count matches", async () => {
      await masterKnex("superadmin.extraction_intakes").insert([
        { job_id: jobId, intake_name: "Semester 1 2026" },
        { job_id: jobId, intake_name: "Semester 2 2026" },
      ]);
      const all = await courses.listIntakesByJob(jobId, 10, 0);
      eq(all.length, 2, "unfiltered count");
      const filtered = await courses.listIntakesByJob(jobId, 10, 0, { search: "semester 1" });
      eq(filtered.length, 1, "filtered rows");
      eq(filtered[0].intake_name, "Semester 1 2026");
      eq(await courses.countIntakesByJob(jobId, { search: "semester 1" }), 1, "filtered count");
    });

    await assert("agents: search matches name/country/email/city (preserves the tab's old client-side scope)", async () => {
      await masterKnex("superadmin.extraction_agents").insert([
        { job_id: jobId, name: "AECC Global", country: "Australia", email: "info@aecc.example", city: "Sydney" },
        { job_id: jobId, name: "Study Direct", country: "Canada", email: "info@studydirect.example", city: "Toronto" },
      ]);
      eq((await review.listAgentsByJobPaged(jobId, 10, 0)).length, 2, "unfiltered count");
      eq((await review.listAgentsByJobPaged(jobId, 10, 0, { search: "sydney" })).length, 1, "matches by city");
      eq((await review.listAgentsByJobPaged(jobId, 10, 0, { search: "canada" })).length, 1, "matches by country");
      eq(await review.countAgentsByJob(jobId, { search: "aecc" }), 1, "count matches by name");
    });

    await assert("campuses: search filters by name, pagination slices correctly", async () => {
      await masterKnex("superadmin.extraction_campuses").insert([
        { job_id: jobId, name: "Main Campus" },
        { job_id: jobId, name: "Downtown Campus" },
        { job_id: jobId, name: "Regional Campus" },
      ]);
      eq(await review.countCampusesByJob(jobId), 3, "unfiltered total");
      const page1 = await review.listCampusesByJobPaged(jobId, 2, 0);
      const page2 = await review.listCampusesByJobPaged(jobId, 2, 2);
      eq(page1.length, 2, "page 1 size");
      eq(page2.length, 1, "page 2 size");
      eq(await review.countCampusesByJob(jobId, { search: "downtown" }), 1, "filtered count");
    });
  } finally {
    await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
