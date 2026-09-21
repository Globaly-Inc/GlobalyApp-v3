// Step dispatch service — validates context and publishes to STEPS queue.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { logAudit } from "../shared/audit.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { RunStepInput, PipelineStep } from "../schemas/step.schema.js";
import { countSiteUrls } from "../repositories/site-urls.repository.js";
import { setProgress } from "../lib/pipeline-steps.js";

const logger = createChildLogger("extraction-step-service");

export async function dispatchStep(jobId: string, input: RunStepInput, adminId: number) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) throw new NotFoundError("Extraction job not found");

  const { step, course_id, data_type, visa_service_id, fresh } = input;

  // Validate step-specific prerequisites
  if (step === "agents") {
    const guided = typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : (job.guided_urls || {});
    const agentUrls = guided.agents_urls;
    if (!agentUrls || (Array.isArray(agentUrls) && agentUrls.length === 0)) {
      throw new BadRequestError("agents step requires guided_urls.agents_urls to be set");
    }
  }

  if (step === "course_data") {
    if (!course_id) throw new BadRequestError("course_data step requires course_id");
    if (!data_type) throw new BadRequestError("course_data step requires data_type");
    const course = await masterKnex(`${S}.extraction_courses`).where({ id: course_id, job_id: jobId }).first();
    if (!course) throw new NotFoundError("Course not found for this job");
  }

  if (step === "visa_services") {
    const guided = typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls) : (job.guided_urls || {});
    const servicesUrls = guided.services_urls;
    if (!servicesUrls || (Array.isArray(servicesUrls) && servicesUrls.length === 0)) {
      throw new BadRequestError("visa_services step requires guided_urls.services_urls to be set");
    }
  }

  if (step === "visa_service_data") {
    if (!visa_service_id) throw new BadRequestError("visa_service_data step requires visa_service_id");
    const visaService = await masterKnex(`${S}.extraction_visa_services`).where({ id: visa_service_id, job_id: jobId }).first();
    if (!visaService) throw new NotFoundError("Visa service not found for this job");
    if (!visaService.source_url) throw new BadRequestError("This visa service has no source_url to re-scrape");
  }

  // The chained steps read the previous step's table, so they refuse to run before it exists —
  // a 400 that names the step to run is the whole "one step at a time" contract for the admin.
  const progress = typeof job.pipeline_progress === "string"
    ? JSON.parse(job.pipeline_progress)
    : (job.pipeline_progress || {});
  if (step === "site_snapshot" && (await countSiteUrls(jobId)) === 0) {
    throw new BadRequestError("site_snapshot needs the site list — run site_map first");
  }
  const requires: Partial<Record<PipelineStep, PipelineStep[]>> = {
    url_classify: ["site_map", "site_analysis"],
    queue_pages: ["url_classify"],
  };
  for (const dep of requires[step] ?? []) {
    if (progress[dep] !== "done") throw new BadRequestError(`${step} requires ${dep} to have completed — run it first`);
  }

  // Mark this step processing — an atomic merge, so a step finishing concurrently keeps its status.
  await setProgress(jobId, { [step]: "processing" });

  // Publish to queue
  await queueService.publish(EXTRACTION_QUEUES.STEPS, {
    jobId,
    step,
    courseId: course_id ?? null,
    dataType: data_type ?? null,
    visaServiceId: visa_service_id ?? null,
    ...(step === "site_snapshot" && fresh ? { fresh: true } : {}),
  });

  await logAudit(adminId, "EXTRACTION_STEP_DISPATCH", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: { step, course_id, data_type, visa_service_id, ...(fresh ? { fresh } : {}) },
  });

  logger.info("Dispatched step", { jobId, step, course_id, data_type });
  return { dispatched: true, step };
}
