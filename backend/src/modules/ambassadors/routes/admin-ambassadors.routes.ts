// Admin ambassador monitoring. Registered under
// /api/v3/admin/monitoring/ambassador-programs behind requireAdmin — this is
// what frontend/src/app/admin/monitoring/ambassador-programs renders.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { AdminListQuerySchema } from "../schemas/ambassadors.schema.js";
import * as service from "../services/admin.service.js";

export async function adminAmbassadorRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await service.statsForAdmin()));

  app.get("/", async (req, reply) => {
    const query = AdminListQuerySchema.parse(req.query);
    return reply.send(await service.listForAdmin(query));
  });
}
