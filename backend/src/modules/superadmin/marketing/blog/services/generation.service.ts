import { queueService } from "../../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as repo from "../repositories/generation-jobs.repository.js";
import type { GenerationJobStatusRow } from "../repositories/generation-jobs.repository.js";
import type { GenerationInput } from "../schemas/generation.schema.js";

const logger = createChildLogger("blog-generation");

/** LavinMQ queue the worker (workers/blog-generate.worker.ts) consumes. */
export const BLOG_GENERATE_QUEUE = "blog.generate";

export async function createGeneration(input: GenerationInput): Promise<{ jobIds: number[] }> {
  const jobs = await repo.createJobs(
    Array.from({ length: input.count }, () => ({
      keywords: input.keywords,
      context: input.context ?? null,
      topic: input.topic ?? null,
      country: input.country ?? null,
    })),
  );

  // Publish is a trigger, not the source of truth — the DB rows are. If LavinMQ is down
  // the jobs stay `pending` and the worker's startup sweep picks them up (same pattern as
  // guides.service submitLead / enquiry email-queue).
  try {
    await Promise.all(jobs.map((job) => queueService.publish(BLOG_GENERATE_QUEUE, { jobId: job.id })));
  } catch (err) {
    logger.error("Failed to publish blog.generate — jobs stay pending for the sweep worker", {
      jobIds: jobs.map((j) => j.id),
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { jobIds: jobs.map((j) => j.id) };
}

export async function getGenerationStatus(ids: number[]): Promise<GenerationJobStatusRow[]> {
  return repo.findJobsByIds(ids);
}
