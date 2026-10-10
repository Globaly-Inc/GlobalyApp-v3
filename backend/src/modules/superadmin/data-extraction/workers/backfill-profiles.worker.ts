// One-shot backfill — re-applies each extraction's overview to its own institution/business
// profile (backfillSelfServiceProfile), for profiles extracted before a field was mapped
// (e.g. institutions' social links). Only fills BLANK fields, so owner edits are never overwritten.
//
// Run with: npm run job:backfill-profiles

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { backfillSelfServiceProfile, pickOverviewMedia } from "../lib/overview-sync.js";
import { inheritHeadOfficeProfile } from "../../platform/business-branches/services/business-branches.service.js";

const logger = createChildLogger("backfill-profiles-worker");

async function main() {
  const jobs = await masterKnex("superadmin.extraction_institution_overview").distinct("job_id");
  let failed = 0;
  for (const { job_id } of jobs) {
    // Overviews written before media was stored get their cover + photos picked first.
    await pickOverviewMedia(String(job_id))
      .then(() => backfillSelfServiceProfile(String(job_id)))
      .catch((err) => {
        failed += 1;
        logger.warn("Profile backfill failed", { jobId: job_id, error: String(err) });
      });
  }
  logger.info("Profile backfill done", { jobs: jobs.length, failed });

  // Branches (converted campuses) inherit their head office's blank profile fields — after the
  // loop above, so a head office filled just now passes its photos on too.
  const [instBranches, bizBranches] = await Promise.all([
    masterKnex("institutions").whereNotNull("parent_institution_id").whereNull("deleted_at").select("id", "parent_institution_id as parent"),
    masterKnex("businesses").whereNotNull("parent_business_id").whereNull("deleted_at").select("id", "parent_business_id as parent"),
  ]);
  for (const [table, rows] of [["institutions", instBranches], ["businesses", bizBranches]] as const) {
    for (const r of rows) {
      await inheritHeadOfficeProfile(table, Number(r.id), Number(r.parent)).catch((err) =>
        logger.warn("Branch profile inherit failed", { table, id: r.id, error: String(err) }),
      );
    }
  }
  logger.info("Branch profile inherit done", { institutions: instBranches.length, businesses: bizBranches.length });
}

main()
  .catch((err) => {
    logger.error("Profile backfill failed", { error: String(err) });
    process.exitCode = 1;
  })
  .finally(() => masterKnex.destroy());
