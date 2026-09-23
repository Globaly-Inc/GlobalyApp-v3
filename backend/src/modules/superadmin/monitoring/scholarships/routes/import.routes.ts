// Bulk-import routes — the admin UI has already parsed the spreadsheet and mapped its
// columns client-side (nothing here trusts raw file content); this just hands the
// already-normalized rows to a background worker instead of creating them inline,
// so a large import doesn't block the request or the admin's browser tab.

import type { FastifyInstance } from "fastify";
import { queueService } from "../../../../../shared/queue/queueService.js";
import * as importJobs from "../repositories/import-jobs.repository.js";
import { ImportRowsSchema, IdParamSchema } from "../schemas/scholarships.schema.js";

export const SCHOLARSHIP_IMPORT_QUEUE = "scholarship_import";

export async function importRoutes(app: FastifyInstance) {
  app.post("/import", async (req, reply) => {
    const { rows } = ImportRowsSchema.parse(req.body);
    const job = await importJobs.createJob(Number(req.auth.sub), rows.length);
    try {
      await queueService.publish(SCHOLARSHIP_IMPORT_QUEUE, { jobId: job.id, rows });
    } catch (err) {
      // Otherwise the job sits "pending" forever with no message ever published and no sweep
      // to recover it — a retry would only create a second, equally-orphaned job.
      await importJobs.markFailed(job.id, "Failed to queue import for processing");
      throw err;
    }
    return reply.status(202).send(job);
  });

  app.get("/import/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const job = await importJobs.findJob(id);
    if (!job) return reply.status(404).send({ error: "Import job not found" });
    return reply.send(job);
  });
}
