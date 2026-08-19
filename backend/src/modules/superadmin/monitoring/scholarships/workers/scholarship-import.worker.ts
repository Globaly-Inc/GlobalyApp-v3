// Worker — consumes "scholarship_import" queue, published by import.routes.ts.
// Run with: npm run job:scholarship-import

import "dotenv/config";
import { queueService } from "../../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as scholarships from "../repositories/scholarships.repository.js";
import * as importJobs from "../repositories/import-jobs.repository.js";
import { ScholarshipInputSchema, type ScholarshipInput } from "../schemas/scholarships.schema.js";
import { SCHOLARSHIP_IMPORT_QUEUE } from "../routes/import.routes.js";

const logger = createChildLogger("scholarship-import-worker");

await queueService.consume(SCHOLARSHIP_IMPORT_QUEUE, async (msg) => {
  const { jobId, rows } = JSON.parse(msg!.content.toString()) as { jobId: number; rows: ScholarshipInput[] };
  logger.info("Processing scholarship import job", { jobId, rows: rows.length });

  try {
    await importJobs.markProcessing(jobId);

    for (const row of rows) {
      const parsed = ScholarshipInputSchema.safeParse(row);
      if (!parsed.success) {
        await importJobs.recordRowResult(jobId, {
          title: row.title ?? "(untitled)", status: "error", detail: parsed.error.issues[0]?.message ?? "Invalid row",
        });
        continue;
      }
      try {
        await scholarships.insert(parsed.data);
        await importJobs.recordRowResult(jobId, { title: parsed.data.title, status: "ok" });
      } catch (err) {
        await importJobs.recordRowResult(jobId, {
          title: parsed.data.title, status: "error", detail: err instanceof Error ? err.message : "Failed to create",
        });
      }
    }

    await importJobs.markCompleted(jobId);
    logger.info("Scholarship import job completed", { jobId });
  } catch (err) {
    logger.error("Scholarship import job failed", { jobId, error: err });
    await importJobs.markFailed(jobId, err instanceof Error ? err.message : "Unexpected failure");
  }
});

logger.info(`Scholarship import worker started — consuming '${SCHOLARSHIP_IMPORT_QUEUE}' queue`);
