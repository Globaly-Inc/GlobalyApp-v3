// Aggregator extraction routes.

import type { FastifyInstance } from "fastify";
import { AggregatorExtractSchema } from "../schemas/aggregator.schema.js";
import * as service from "../services/aggregator.service.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";

export async function aggregatorRoutes(app: FastifyInstance) {

  // POST /aggregator/extract
  app.post("/aggregator/extract", async (req, reply) => {
    const { url } = AggregatorExtractSchema.parse(req.body);
    const result = await service.extractFromAggregator(url, await adminId(req));
    return reply.status(201).send({
      job_id: result.jobId,
      aggregator: result.aggregator,
      institution: result.institution,
      courses_queued: result.coursesQueued,
    });
  });
}
