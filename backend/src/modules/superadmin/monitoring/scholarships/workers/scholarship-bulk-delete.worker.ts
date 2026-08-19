// Worker — consumes "scholarship_bulk_delete" queue, published by bulk-delete.routes.ts.
// Run with: npm run job:scholarship-bulk-delete

import "dotenv/config";
import { queueService } from "../../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as repo from "../../../platform/platform.repository.js";
import * as service from "../services/scholarships.service.js";
import { SCHOLARSHIP_BULK_DELETE_QUEUE } from "../routes/bulk-delete.routes.js";

const logger = createChildLogger("scholarship-bulk-delete-worker");

await queueService.consume(SCHOLARSHIP_BULK_DELETE_QUEUE, async (msg) => {
  const { ids, deletedBy } = JSON.parse(msg!.content.toString()) as { ids: number[]; deletedBy: number };
  for (const id of ids) {
    try {
      await service.remove(id);
      await repo.logAdminAction(deletedBy, "SCHOLARSHIP_DELETED", "scholarship", undefined, { scholarship_id: id, bulk: true });
    } catch (err) {
      logger.warn("Bulk delete failed for scholarship", { id, err: (err as Error).message });
    }
  }
  logger.info("Bulk delete processed", { count: ids.length });
});

logger.info(`Scholarship bulk-delete worker started — consuming '${SCHOLARSHIP_BULK_DELETE_QUEUE}' queue`);
