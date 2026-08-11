// Step dispatch service — validates context and publishes to STEPS queue.

import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { logAudit } from "../shared/audit.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { RunStepInput, PipelineStep } from "../schemas/step.schema.js";

const logger = createChildLogger("extraction-step-service");

export async function dispatchStep(jobId: string, input: RunStepInput, adminId: number) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) throw new NotFoundError("Extraction job not found");

  const { step, course_id, data_type } = input;

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

  // Update pipeline_progress for this step
  const progress = typeof job.pipeline_progress === "string"
    ? JSON.parse(job.pipeline_progress)
    : (job.pipeline_progress || {});
  progress[step] = "processing";
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    pipeline_progress: JSON.stringify(progress),
    processing_heartbeat_at: masterKnex.fn.now(),
    updated_at: masterKnex.fn.now(),
  });

  // Publish to queue
  await queueService.publish(EXTRACTION_QUEUES.STEPS, {
    jobId,
    step,
    courseId: course_id ?? null,
    dataType: data_type ?? null,
  });

  await logAudit(adminId, "EXTRACTION_STEP_DISPATCH", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: { step, course_id, data_type },
  });

  logger.info("Dispatched step", { jobId, step, course_id, data_type });
  return { dispatched: true, step };
}
