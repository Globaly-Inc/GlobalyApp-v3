// AgentCIS institution web-enrichment ("Enrich from Website").
//
// AgentCIS imports (lib/agentcis-staging.ts) never crawl the institution's own site — every
// course/campus/fee comes structured from the AgentCIS API. That means AgentCIS-sourced courses
// can never have study units (curriculum), since AgentCIS's own schema has no such field (see
// data-extraction/CLAUDE.md). This action re-runs the SAME site-discovery/crawl pipeline every
// other job already uses, over the SAME job_id, pointed at the institution's real website — so
// writeCourse's job-scoped course-name match (staging-writer.ts) naturally attaches whatever it
// finds onto the AgentCIS course rows instead of creating duplicates.
//
// Safety: writeCourse's per-category "has any existing?" guard (staging-writer.ts) makes this
// strictly additive for an AgentCIS job — it only ever fills a fee/intake/study-option/
// eligibility/english-requirement/study-unit slot a course doesn't already have one of, and
// never updates or deletes anything AgentCIS already wrote. writeInstitutionOverview is
// fill-blanks-only by its own SQL merge (COALESCE(NULLIF(new, ''), existing)), so re-running
// site analysis against the same job is safe there too.
//
// Kept in its own file, not folded into queue.service.ts, so this AgentCIS-specific trigger
// stays easy to find and change independently of the general job-queue actions it reuses.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService as pipelineQueue } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { logAudit } from "../shared/audit.js";
import { reactivateJob } from "../repositories/queue.repository.js";
import { findJobById } from "../repositories/jobs.repository.js";

const logger = createChildLogger("agentcis-enrichment-service");

// AgentCIS's own synthetic fallback (lib/agentcis-staging.ts) when it never gave a real
// website — nothing on the real internet to crawl there.
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

  // Same reactivation deep-scrape/rerun already use — clears a paused/failed/declined status so
  // the job worker's guard doesn't drop the re-dispatch. "done" isn't in that list, so it passes
  // through untouched here; the worker itself sets status to "processing" as its first action.
  await reactivateJob(jobId, adminId);
  await logAudit(adminId, "JOB_ENRICH_FROM_WEB", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: { institution_url: job.institution_url },
  });

  try {
    await pipelineQueue.publish(EXTRACTION_QUEUES.JOBS, { jobId, resumed: true });
  } catch {
    logger.warn("Queue unavailable on enrich-from-web, worker will poll", { jobId });
  }

  return { updated: true };
}
