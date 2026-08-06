// Promote service — pushes extraction data to the live catalog.
//
// ponytail: This is a stub. The full promote logic reads 15+ extraction tables
// and writes to 11+ live catalog tables (businesses, business_branches, business_services,
// service_fees, service_intakes, etc.). Those live catalog tables do not exist in V3 yet.
//
// When the catalog tables land, implement the full promote transaction here.
// See docs/extraction-v2-endpoints.md Section 2 (P1) for the complete spec.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import { PROMOTABLE_JOB_STATUSES } from "../schemas/jobs.schema.js";

export async function promoteJob(jobId: string, adminId: number) {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  if (!PROMOTABLE_JOB_STATUSES.includes((job as any).status)) {
    throw new BadRequestError(
      `Job status "${(job as any).status}" is not promotable. Must be one of: ${PROMOTABLE_JOB_STATUSES.join(", ")}`,
    );
  }

  // ponytail: stub — live catalog tables don't exist yet.
  // When they do, this becomes a single transaction that:
  // 1. Upserts business from extraction_institution_overview
  // 2. Creates branches from extraction_campuses
  // 3. Upserts services from extraction_courses (via promoteCourses)
  // 4. Creates agents/representations from extraction_agents
  // 5. Sets job status to 'exported'
  //
  // For now, just mark as exported so the frontend can proceed.
  await jobsRepo.updateJob(jobId, { status: "exported" });

  const result = {
    business_id: null,
    business_created: false,
    branches_created: 0,
    branches_reused: 0,
    services_inserted: 0,
    services_reused: 0,
    fees_inserted: 0,
    fee_assignments_created: 0,
    intakes_inserted: 0,
    eligibility_inserted: 0,
    eligibility_assignments_created: 0,
    sharing_rows_created: 0,
    agents_created: 0,
    agents_reused: 0,
    representations_created: 0,
    _stub: true,
  };

  await logAudit(adminId, "EXTRACTION_PROMOTE", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: result,
  });

  return result;
}
