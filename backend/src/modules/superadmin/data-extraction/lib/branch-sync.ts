import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { seedBranchesFromCampuses } from "../../platform/business-branches/repositories/business-branches.repository.js";

const logger = createChildLogger("branch-sync");

export async function seedBranchesFromJob(orgId: number, schemaName: string, jobId: string): Promise<void> {
  const campuses = await masterKnex("superadmin.extraction_campuses")
    .where({ job_id: jobId })
    .select("id", "name", "country", "state", "city", "address", "phone", "email");
  if (campuses.length === 0) return;

  await seedBranchesFromCampuses(orgId, schemaName, campuses);
  logger.info("Seeded branches from extraction campuses", { jobId, orgId, count: campuses.length });
}
