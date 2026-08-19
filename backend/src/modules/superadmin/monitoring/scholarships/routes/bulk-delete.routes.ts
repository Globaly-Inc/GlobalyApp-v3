// Bulk-delete — fire-and-forget queue, same pattern as
// businesses/workers/claim-requests-bulk.worker.ts. No progress tracking: deletes are fast
// and low-risk, so the request just queues the batch and returns immediately.

import type { FastifyInstance } from "fastify";
import { queueService } from "../../../../../shared/queue/queueService.js";
import { BulkDeleteSchema } from "../schemas/scholarships.schema.js";

export const SCHOLARSHIP_BULK_DELETE_QUEUE = "scholarship_bulk_delete";

export async function bulkDeleteRoutes(app: FastifyInstance) {
  app.post("/bulk-delete", async (req, reply) => {
    const { ids } = BulkDeleteSchema.parse(req.body);
    await queueService.publish(SCHOLARSHIP_BULK_DELETE_QUEUE, { ids, deletedBy: Number(req.auth.sub) });
    return reply.status(202).send({ queued: ids.length });
  });
}
