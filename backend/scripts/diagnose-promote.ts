// Diagnostic — why is "Publish to Business" not inserting into institutions/businesses?
//
// Calls promoteJob() directly against the DB. No HTTP, no JWT, no frontend, no mock layer, so
// whatever this prints is the backend's real behaviour. The button goes through four layers
// that can each swallow the cause (mock API switch, super_admin hook, route prefix, toast that
// shows "Publish failed" without the message) — this skips all of them.
//
// Run with: npm run diagnose:promote            (picks the oldest promotable job)
//           npm run diagnose:promote -- <jobId> (a specific job)

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { PROMOTABLE_JOB_STATUSES } from "../src/modules/superadmin/data-extraction/schemas/jobs.schema.js";
import { promoteJob } from "../src/modules/superadmin/data-extraction/services/promote.service.js";

/** The columns promote writes. If the migration rolled back, these are missing. */
const REQUIRED_COLUMNS: Array<[string, string]> = [
  ["businesses", "source_job_id"],
  ["businesses", "source_agent_id"],
  ["businesses", "schema_provisioned_at"],
  ["institutions", "source_job_id"],
  ["institutions", "schema_provisioned_at"],
  ["institutions", "claim_status"],
  ["institutions", "account_status"],
];

/**
 * Columns promote leaves NULL for an unclaimed listing. Existing isn't enough — while these are
 * still NOT NULL every publish dies on a constraint violation, which is how 20260823_004 being
 * unapplied showed up as a bare 500.
 */
const MUST_BE_NULLABLE: Array<[string, string]> = [
  ["businesses", "owner_id"],
  ["institutions", "platform_user_id"],
  ["institutions", "first_name"],
  ["institutions", "last_name"],
];

async function checkSchema(): Promise<boolean> {
  let ok = true;
  for (const [table, column] of REQUIRED_COLUMNS) {
    const exists = await masterKnex.schema.hasColumn(table, column);
    if (!exists) {
      console.error(`  MISSING  ${table}.${column}`);
      ok = false;
    }
  }

  const nullability = await masterKnex("information_schema.columns")
    .whereIn(
      ["table_name", "column_name"],
      MUST_BE_NULLABLE.map(([t, c]) => [t, c]),
    )
    .select("table_name", "column_name", "is_nullable");

  for (const [table, column] of MUST_BE_NULLABLE) {
    const row = nullability.find((r: any) => r.table_name === table && r.column_name === column);
    if (row && row.is_nullable === "NO") {
      console.error(`  NOT NULL ${table}.${column} — must be nullable (migration 20260823_004)`);
      ok = false;
    }
  }

  if (ok) console.log("  all provenance columns present, owner columns nullable");
  return ok;
}

async function main() {
  console.log("\n1. Schema check (migrations 20260823_001 / _003 / _004)");
  const schemaOk = await checkSchema();
  if (!schemaOk) {
    console.error(
      "\nFAIL: a migration has not applied. Promote cannot insert until it has.\n" +
        "      Run: npm run migrate:globalyapp\n" +
        "      If that says 'Already up to date', the migration recorded as applied while its\n" +
        "      statements rolled back — say so and I'll add a follow-up migration.",
    );
    await masterKnex.destroy();
    process.exit(1);
  }

  const jobId = process.argv[2];
  const job = jobId
    ? await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).first()
    : await masterKnex("superadmin.extraction_jobs")
        .whereIn("status", [...PROMOTABLE_JOB_STATUSES])
        .orderBy("created_at")
        .first();

  if (!job) {
    console.error(jobId ? `\nNo job with id ${jobId}` : "\nNo promotable jobs exist at all.");
    await masterKnex.destroy();
    process.exit(1);
  }

  console.log("\n2. Job");
  console.log({
    id: job.id,
    status: job.status,
    source_type: job.source_type,
    business_category_id: job.business_category_id,
    institution_name: job.institution_name,
  });

  // Routing is decided from these two fields alone — print the verdict before running, so a
  // refusal is obviously a routing decision and not a crash.
  const willRoute = job.business_category_id
    ? "by business_category_id"
    : job.source_type === "agentcis"
      ? "institutions (agentcis special case)"
      : "REFUSED — no business_category_id and not agentcis";
  console.log(`   routing: ${willRoute}`);

  console.log("\n3. Existing listing for this job");
  const [biz, inst] = await Promise.all([
    masterKnex("businesses").where({ source_job_id: job.id }).first("id", "business_name", "account_status"),
    masterKnex("institutions").where({ source_job_id: job.id }).first("id", "institution_name", "account_status"),
  ]);
  console.log({ business: biz ?? null, institution: inst ?? null });

  console.log("\n4. Calling promoteJob()");
  try {
    // adminId 0 is deliberate: logAudit resolves it to an admin_users row and silently skips
    // when there is none, so a bogus id costs the audit row and nothing else.
    const result = await promoteJob(job.id as string, 0);
    console.log("   OK:", result);

    const after = await Promise.all([
      masterKnex("businesses").where({ source_job_id: job.id }).first("id", "business_name"),
      masterKnex("institutions").where({ source_job_id: job.id }).first("id", "institution_name"),
    ]);
    console.log("   row now present:", { business: after[0] ?? null, institution: after[1] ?? null });
  } catch (err) {
    console.error("\n   THREW:", (err as Error).message);
    console.error("\n   stack:", (err as Error).stack);
    await masterKnex.destroy();
    process.exit(1);
  }

  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("diagnostic itself failed:", err);
  await masterKnex.destroy();
  process.exit(1);
});
