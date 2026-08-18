// Admin job monitoring. Registered under /api/v3/admin/monitoring/jobs behind
// requireAdmin — this is what frontend/src/app/admin/monitoring/jobs renders.
//
// Read-only, and cross-business by design: V2's admin-jobs.ts bypassed RLS for
// exactly this surface, because a super-admin must see draft and closed postings
// belonging to businesses they are not a member of. The requireAdmin gate is the
// boundary that replaces RLS here.
//
// No mutations. Featuring or closing someone else's posting is a real power that
// needs its own audit trail; same call as the enquiries monitoring page.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { AdminJobsQuery } from "../schemas/jobs.schema.js";
import * as service from "../services/admin-jobs.service.js";

export async function adminJobsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await service.stats()));

  app.get("/", async (req, reply) => {
    const query = AdminJobsQuery.parse(req.query);
    return reply.send(await service.list(query));
  });
}
