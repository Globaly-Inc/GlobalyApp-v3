// Promote routes — maps V2 endpoint P1.

import type { FastifyInstance } from "fastify";
import * as service from "../services/promote.service.js";
import { PromoteJobParamSchema } from "../schemas/promote.schema.js";

export async function promoteRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // P1: POST /:jobId/promote
  app.post("/:jobId/promote", async (req, reply) => {
    const { jobId } = PromoteJobParamSchema.parse(req.params);
    return reply.send(await service.promoteJob(jobId, adminId(req)));
  });
}
