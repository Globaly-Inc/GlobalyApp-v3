// Worker — consumes "extraction_course_bulk_delete" queue, published by courses.routes.ts.
// Run with: npm run job:extraction-course-bulk-delete

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import * as service from "../services/courses.service.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";

const logger = createChildLogger("extraction-course-bulk-delete-worker");

await queueService.consume(EXTRACTION_QUEUES.COURSE_BULK_DELETE, async (msg) => {
  const { ids, deletedBy } = JSON.parse(msg!.content.toString()) as { ids: string[]; deletedBy: number };
  try {
    const { deleted } = await service.bulkDeleteCourses(ids, deletedBy);
    logger.info("Bulk delete processed", { requested: ids.length, deleted });
  } catch (err) {
    logger.warn("Bulk delete failed", { ids, err: (err as Error).message });
  }
});

logger.info(`Course bulk-delete worker started — consuming '${EXTRACTION_QUEUES.COURSE_BULK_DELETE}' queue`);
