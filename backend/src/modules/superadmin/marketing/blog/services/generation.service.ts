import { queueService } from "../../../../../shared/queue/queueService.js";
import * as repo from "../repositories/generation-jobs.repository.js";
import type { GenerationJobStatusRow } from "../repositories/generation-jobs.repository.js";
import type { GenerationInput } from "../schemas/generation.schema.js";

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

  await Promise.all(jobs.map((job) => queueService.publish(BLOG_GENERATE_QUEUE, { jobId: job.id })));
  return { jobIds: jobs.map((j) => j.id) };
}

export async function getGenerationStatus(ids: number[]): Promise<GenerationJobStatusRow[]> {
  return repo.findJobsByIds(ids);
}
