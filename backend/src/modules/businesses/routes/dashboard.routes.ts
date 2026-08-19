// GET /api/v3/businesses/dashboard — the business portal landing screen.
//
// requireBusinessContext establishes that a business was named; the service then
// establishes that the caller is a member of it. Both are needed: the first is a
// claim check, the second is a fact check against the tenant schema.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/dashboard.service.js";

export async function businessDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: requireBusinessContext }, async (req, reply) => {
    return reply.send(await service.getDashboard(req.db, req.business!, Number(req.auth.sub)));
  });
}
