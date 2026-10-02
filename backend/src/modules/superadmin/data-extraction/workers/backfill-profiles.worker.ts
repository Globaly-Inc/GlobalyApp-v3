// One-shot backfill — re-applies each extraction's overview to its own institution/business
// profile (backfillSelfServiceProfile), for profiles extracted before a field was mapped
// (e.g. institutions' social links). Only fills BLANK fields, so owner edits are never overwritten.
//
// Run with: npm run job:backfill-profiles

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { backfillSelfServiceProfile } from "../lib/overview-sync.js";

const logger = createChildLogger("backfill-profiles-worker");

async function main() {
  const jobs = await masterKnex("superadmin.extraction_institution_overview").distinct("job_id");
  let failed = 0;
  for (const { job_id } of jobs) {
    await backfillSelfServiceProfile(String(job_id)).catch((err) => {
      failed += 1;
      logger.warn("Profile backfill failed", { jobId: job_id, error: String(err) });
    });
  }
  logger.info("Profile backfill done", { jobs: jobs.length, failed });
}

main()
  .catch((err) => {
    logger.error("Profile backfill failed", { error: String(err) });
    process.exitCode = 1;
  })
  .finally(() => masterKnex.destroy());
