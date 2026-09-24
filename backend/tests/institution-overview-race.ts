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

const TEST_JOB_ID = "00000000-0000-0000-0000-0000000000f1";

async function main() {
  console.log("writeInstitutionOverview concurrency tests (DB integration)\n");

  const { writeInstitutionOverview } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");

  await masterKnex("superadmin.extraction_institution_overview").where({ job_id: TEST_JOB_ID }).delete();
  await masterKnex("superadmin.extraction_jobs").where({ id: TEST_JOB_ID }).delete();
  await masterKnex("superadmin.extraction_jobs").insert({
    id: TEST_JOB_ID, institution_url: "https://race-test.example.com", status: "processing",
  });

  try {
    await assert("two concurrent writes for the same new job_id both resolve without throwing", async () => {
      await Promise.all([
        writeInstitutionOverview(TEST_JOB_ID, { name: "Race University", phone: "111-111" }),
        writeInstitutionOverview(TEST_JOB_ID, { name: "Race University", email: "info@race.edu" }),
      ]);
    });

    await assert("exactly one row exists, merging both racing writers' data", async () => {
      const rows = await masterKnex("superadmin.extraction_institution_overview").where({ job_id: TEST_JOB_ID });
      eq(rows.length, 1, "row count");
      eq(rows[0].phone, "111-111", "phone");
      eq(rows[0].email, "info@race.edu", "email");
    });

    await assert("a later write still merges — new value wins, null fields keep the old value", async () => {
      await writeInstitutionOverview(TEST_JOB_ID, {
        name: "Race University Updated", phone: null, email: null, website: "https://race.edu",
      });
      const row = await masterKnex("superadmin.extraction_institution_overview").where({ job_id: TEST_JOB_ID }).first();
      eq(row.name, "Race University Updated", "name");
      eq(row.phone, "111-111", "phone (preserved)");
      eq(row.email, "info@race.edu", "email (preserved)");
      eq(row.website, "https://race.edu", "website (newly set)");
    });
  } finally {
    await masterKnex("superadmin.extraction_institution_overview").where({ job_id: TEST_JOB_ID }).delete();
    await masterKnex("superadmin.extraction_jobs").where({ id: TEST_JOB_ID }).delete();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
