// AgentCIS imports never crawl the institution's own site, so AgentCIS courses can never get
// study units through that path. This re-runs the normal discovery/crawl pipeline over the same
// job_id against the institution's real website — writeCourse's job-scoped name match attaches
// results onto the existing AgentCIS courses, and its per-category guard (staging-writer.ts)
// keeps this strictly additive, never touching data AgentCIS already wrote.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService as pipelineQueue } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";
import { claimDoneJob } from "../repositories/queue.repository.js";
import { findJobById, updateJob } from "../repositories/jobs.repository.js";

const logger = createChildLogger("agentcis-enrichment-service");

// AgentCIS's synthetic fallback when it has no real website — nothing to crawl there.
const AGENTCIS_SYNTHETIC_URL_PREFIX = "https://agentcis.com/institution/";

export async function enrichFromWebsite(jobId: string, adminId: number) {
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  if (job.source_type !== "agentcis") {
    throw new BadRequestError("Enrich from Website is only for AgentCIS-imported jobs");
  }
  if (!job.institution_url || job.institution_url.startsWith(AGENTCIS_SYNTHETIC_URL_PREFIX)) {
    throw new BadRequestError("AgentCIS never supplied a real website for this institution — there is nothing to crawl");
  }

  // The "done" check and the flip to "processing" happen in ONE atomic update (claimDoneJob),
  // not a prior read-then-branch: two concurrent requests both reading "done" would otherwise
  // both pass and both publish, dispatching two full crawls for the same job — the worker
  // tolerates a message for a job already "processing" (it has to, for redelivery), so nothing
  // downstream would reject the second one either (review finding, 2026-09-15).
  const claimed = await claimDoneJob(jobId, adminId);
  if (!claimed) {
    throw new BadRequestError('This AgentCIS job must finish importing (status "done") before it can be enriched');
  }

  // logAudit is INSIDE this guard too, not just the publish call — it's a real DB write between
  // the claim and the publish, and a failure there would otherwise exit before publishing while
  // still leaving the claim's "processing" in place (review finding, 2026-09-15: audit failures
  // strand the job exactly like a publish failure does, since nothing polls a claimed job).
  try {
    await logAudit(adminId, "JOB_ENRICH_FROM_WEB", {
      entityType: "extraction_jobs",
      entityId: jobId,
      details: { institution_url: job.institution_url },
    });
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch (err) {
    // The claim already moved the job to "processing" — undo it so this doesn't strand the job
    // there with nothing queued to ever advance it.
    await updateJob(jobId, { status: "done" }, adminId);
    logger.error("Enrich-from-web failed after claiming the job, rolled back to 'done'", { jobId, err });
    throw err;
  }

  return { updated: true };
}
