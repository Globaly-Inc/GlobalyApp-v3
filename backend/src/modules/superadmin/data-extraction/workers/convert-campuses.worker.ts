// One-shot backfill — converts the campuses of jobs that finished before campus → branch
// conversion existed (or campuses an admin added afterwards) into real branch orgs. New jobs are
// converted by the extraction workers when they finish.
//
// Safe to re-run: claimCampus skips converted, in-flight and failed campuses, and
// convertCampusesToBranches skips jobs whose org has no tenant schema yet.
//
// Run with: npm run job:convert-campuses

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { convertCampusesToBranches } from "../../platform/business-branches/services/business-branches.service.js";

const logger = createChildLogger("convert-campuses-worker");

async function main() {
  const jobs = await masterKnex("superadmin.extraction_campuses")
    .whereNull("converted_branch_id").whereNull("convert_failed_at")
    .distinct("job_id");
  let converted = 0;
  for (const { job_id } of jobs) converted += await convertCampusesToBranches(String(job_id));
  logger.info("Campus conversion backfill done", { jobs: jobs.length, converted });
}

main()
  .catch((err) => {
    logger.error("Campus conversion backfill failed", { error: String(err) });
    process.exitCode = 1;
  })
  .finally(() => masterKnex.destroy());
