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
import { reactivateJob } from "../repositories/queue.repository.js";
import { findJobById } from "../repositories/jobs.repository.js";

const logger = createChildLogger("agentcis-enrichment-service");

// AgentCIS's synthetic fallback when it has no real website — nothing to crawl there.
const AGENTCIS_SYNTHETIC_URL_PREFIX = "https://agentcis.com/institution/";

export async function enrichFromWebsite(jobId: string, adminId: number) {
  const job = await findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  if (job.source_type !== "agentcis") {
    throw new BadRequestError("Enrich from Website is only for AgentCIS-imported jobs");
  }
  if (job.status !== "done") {
    throw new BadRequestError('This AgentCIS job must finish importing (status "done") before it can be enriched');
  }
  if (!job.institution_url || job.institution_url.startsWith(AGENTCIS_SYNTHETIC_URL_PREFIX)) {
    throw new BadRequestError("AgentCIS never supplied a real website for this institution — there is nothing to crawl");
  }

  // Same reactivation deep-scrape/rerun use; the worker itself flips status to "processing".
  await reactivateJob(jobId, adminId);
  await logAudit(adminId, "JOB_ENRICH_FROM_WEB", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: { institution_url: job.institution_url },
  });

  // Unlike rerun/deep-scrape (which reactivate a job that was already "processing" and have a
  // prior status to fall back to), reactivateJob is a no-op for "done" — so a swallowed publish
  // failure here would leave the job stuck at "done" forever with nothing to ever pick it up.
  // Log it, then rethrow: the admin sees "Enrichment failed" instead of a false "started".
  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch (err) {
    logger.error("Queue publish failed on enrich-from-web — job left at 'done', nothing will pick it up", { jobId, err });
    throw err;
  }

  return { updated: true };
}
