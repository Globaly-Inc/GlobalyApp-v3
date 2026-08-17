// Promote routes — maps V2 endpoint P1, plus the promotion ledger read.

import type { FastifyInstance } from "fastify";
import * as service from "../services/promote.service.js";
import { PromoteJobParamSchema, PromoteJobSchema } from "../schemas/promote.schema.js";

export async function promoteRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // P1: POST /:jobId/promote
  app.post("/:jobId/promote", async (req, reply) => {
    const { jobId } = PromoteJobParamSchema.parse(req.params);
    const input = PromoteJobSchema.parse(req.body ?? {});
    return reply.send(await service.promoteJob(jobId, adminId(req), input));
  });

  // What a previous promote actually did, including what it refused to touch.
  app.get("/:jobId/promotions", async (req, reply) => {
    const { jobId } = PromoteJobParamSchema.parse(req.params);
    return reply.send(await service.listPromotions(jobId));
  });
}
