// Business self-service bulk import — same client-parses-the-spreadsheet, server-just-queues-
// rows pattern as the superadmin editor (see superadmin/monitoring/scholarships/routes/import.routes.ts),
// scoped to the caller's own business: every row is forced onto their business_id and can't set
// is_featured (see the worker), and job polling is scoped so one business can't read another's.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { queueService } from "../../../shared/queue/queueService.js";
import * as importJobs from "../../superadmin/monitoring/scholarships/repositories/import-jobs.repository.js";
import { BusinessImportRowsSchema } from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import { SCHOLARSHIP_IMPORT_QUEUE } from "../../superadmin/monitoring/scholarships/routes/import.routes.js";

const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function businessScholarshipsImportRoutes(app: FastifyInstance) {
  app.post("/scholarships/import", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { rows } = BusinessImportRowsSchema.parse(req.body);
    const businessId = Number(req.business!.id);
    const job = await importJobs.createJob(Number(req.auth.sub), rows.length, businessId);
    try {
      await queueService.publish(SCHOLARSHIP_IMPORT_QUEUE, { jobId: job.id, rows, businessId });
    } catch (err) {
      // Otherwise the job sits "pending" forever with no message ever published and no sweep
      // to recover it — a retry would only create a second, equally-orphaned job.
      await importJobs.markFailed(job.id, "Failed to queue import for processing");
      throw err;
    }
    return reply.status(202).send(job);
  });

  app.get("/scholarships/import/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const businessId = Number(req.business!.id);
    const job = await importJobs.findJobForBusiness(id, businessId);
    if (!job) return reply.status(404).send({ error: "Import job not found" });
    return reply.send(job);
  });
}
