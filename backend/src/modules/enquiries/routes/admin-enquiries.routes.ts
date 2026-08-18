// Admin enquiry monitoring. Registered under /api/v3/admin/monitoring/enquiries
// behind requireAdmin — this is what frontend/src/app/admin/monitoring/enquiries
// renders.
//
// Read-only. Admins see the enquiry and its distribution/unlock counts, never the
// masked-vs-revealed distinction: monitoring is about whether the pipeline and
// the money are working, not about consuming leads.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { AdminListQuerySchema } from "../schemas/enquiries.schema.js";
import * as service from "../services/enquiries.service.js";

export async function adminEnquiriesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await service.statsForAdmin()));

  app.get("/", async (req, reply) => {
    const query = AdminListQuerySchema.parse(req.query);
    return reply.send(await service.listForAdmin(query));
  });
}
