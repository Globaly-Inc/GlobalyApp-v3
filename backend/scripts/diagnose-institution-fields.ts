// Diagnostic — did this session's extraction fixes actually take effect for a given job?
// Checks, directly against the DB (no HTTP, no frontend):
//   1. Institution overview has phone/email (Phase 1 homepage analysis + auto-dispatched
//      "institution" step, which also tries guided_urls.contact_urls / a discovered or
//      guessed /contact page).
//   2. Every campus has phone/email — either found directly, or backfilled from the
//      institution overview (extraction-step.worker.ts's handleBranchesStep fallback).
//   3. Which campuses are missing postcode/map_link — those need "Find Missing Details"
//      (geocoding) run per-campus, this script only reports the gap.
//
// Run with: npm run diagnose:institution-fields <jobId>
// Or without a jobId to run across every institution job.

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";

function status(ok: boolean): string {
  return ok ? "OK  " : "MISS";
}

async function diagnoseJob(jobId: string): Promise<void> {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) {
    console.error(`No job found with id ${jobId}`);
    return;
  }
  console.log(`Job: ${job.institution_name ?? job.institution_url} (${job.status})\n`);

  const overview = await masterKnex(`${S}.extraction_institution_overview`).where({ job_id: jobId }).first();
  console.log("── Institution overview ──");
  if (!overview) {
    console.log("MISS  no overview row at all — Phase 1 site analysis never wrote one");
  } else {
    console.log(`${status(!!overview.phone)} phone: ${overview.phone ?? "—"}`);
    console.log(`${status(!!overview.email)} email: ${overview.email ?? "—"}`);
    console.log(`${status(!!overview.address)} address: ${overview.address ?? "—"}`);
    console.log(`${status(!!overview.zip_code)} postcode: ${overview.zip_code ?? "—"}`);
  }

  const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).orderBy("name");
  console.log(`\n── Campuses (${campuses.length}) ──`);
  if (campuses.length === 0) {
    console.log("(none extracted for this job)");
  }
  for (const c of campuses) {
    const phoneFellBack = !!c.phone && c.phone === overview?.phone;
    const emailFellBack = !!c.email && c.email === overview?.email;
    console.log(`\n${c.name ?? "(unnamed)"}`);
    console.log(`  ${status(!!c.phone)} phone: ${c.phone ?? "—"}${phoneFellBack ? "  (fell back from institution)" : ""}`);
    console.log(`  ${status(!!c.email)} email: ${c.email ?? "—"}${emailFellBack ? "  (fell back from institution)" : ""}`);
    console.log(`  ${status(!!c.postcode)} postcode: ${c.postcode ?? "—"}`);
    console.log(`  ${status(!!c.map_link)} map_link: ${c.map_link ?? "—"}${!c.postcode || !c.map_link ? "  → try Find Missing Details" : ""}`);
  }
}

async function main() {
  const jobId = process.argv[2];

  if (jobId) {
    await diagnoseJob(jobId);
  } else {
    const jobs = await masterKnex(`${S}.extraction_jobs`).where({ source_type: "institution" }).orWhereNull("source_type");
    console.log(`No jobId given — diagnosing all ${jobs.length} institution job(s)\n`);
    for (const job of jobs) {
      await diagnoseJob(job.id);
      console.log("\n" + "=".repeat(60) + "\n");
    }
  }

  await masterKnex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
