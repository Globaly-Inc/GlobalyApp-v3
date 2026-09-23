// One-off backfill: seeds business_branches for already-claimed institutions whose tenant schema
// was provisioned BEFORE institution-claim.service.ts started calling seedBranchesFromJob — so
// their extraction-found campuses were never copied in. Safe to re-run: seedBranchesFromJob is an
// onConflict(uuid).ignore() insert, so an institution already fully seeded is a no-op.
//
// Run with: npm run backfill:institution-branches            (dry run, reports counts only)
//           npm run backfill:institution-branches -- --apply (writes)

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { getKnex, shutdownAll } from "../src/core/db/pool-manager.js";
import { seedBranchesFromJob } from "../src/modules/superadmin/data-extraction/lib/branch-sync.js";

async function main() {
  const apply = process.argv.includes("--apply");

  // whereNot("j.source_type", "self_service") excludes the auto-minted placeholder every
  // self-registered institution starts with (see withPublicSourceJobId) — those jobs never ran
  // the pipeline and have no campuses to seed from.
  const institutions = await masterKnex("institutions as i")
    .join("superadmin.extraction_jobs as j", "j.id", "i.source_job_id")
    .whereNotNull("i.schema_provisioned_at")
    .whereNot("j.source_type", "self_service")
    .select("i.id", "i.institution_name", "i.schema_name", "i.source_job_id");

  console.log(`${institutions.length} claimed institution(s) with a real extraction job.\n`);

  let touched = 0;
  for (const inst of institutions) {
    const campuses = await masterKnex("superadmin.extraction_campuses").where({ job_id: inst.source_job_id });
    if (campuses.length === 0) continue;

    const db = await getKnex(inst.id, inst.schema_name);
    const existingUuids = new Set(
      (await db("business_branches").whereIn("uuid", campuses.map((c) => c.id)).select("uuid")).map((r) => r.uuid),
    );
    const missing = campuses.filter((c) => !existingUuids.has(c.id));
    if (missing.length === 0) continue;

    touched++;
    console.log(`${inst.institution_name} (id ${inst.id}): ${missing.length} campus(es) not yet in business_branches`);
    if (apply) {
      await seedBranchesFromJob(inst.id, inst.schema_name, inst.source_job_id);
    }
  }

  console.log(`\n${touched} institution(s) ${apply ? "backfilled" : "would be backfilled"}.`);
  if (!apply) console.log("Dry run — pass --apply to write.");
  await shutdownAll();
  await masterKnex.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
