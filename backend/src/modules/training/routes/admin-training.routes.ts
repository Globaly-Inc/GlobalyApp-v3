// Admin training monitoring, under /api/v3/admin/monitoring/training behind
// requireAdmin — what frontend/src/app/admin/monitoring/training renders.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { AdminListQuerySchema } from "../schemas/training.schema.js";
import * as service from "../services/certificates.service.js";

export async function adminTrainingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await service.statsForAdmin()));

  app.get("/", async (req, reply) => {
    const query = AdminListQuerySchema.parse(req.query);
    return reply.send(await service.listForAdmin(query));
  });
}
