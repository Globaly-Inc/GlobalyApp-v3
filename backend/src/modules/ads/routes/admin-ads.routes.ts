// Admin ad moderation, behind requireAdmin. Backs admin/marketing/ads.
//
// Route order matters: /stats and /reports are registered before /:id/* so a
// literal path is never captured by the id parameter. Same precedent as
// superadmin/monitoring/scholarships/index.ts.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  AdminCampaignListQuery,
  AdminReportListQuery,
  IdParamSchema,
  RejectSchema,
} from "../schemas/ads.schema.js";
import * as service from "../services/moderation.service.js";

export async function adminAdsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await service.stats()));

  app.get("/reports", async (req, reply) => {
    const query = AdminReportListQuery.parse(req.query);
    return reply.send(await service.listReports(query));
  });

  app.get("/", async (req, reply) => {
    const query = AdminCampaignListQuery.parse(req.query);
    return reply.send(await service.list(query));
  });

  app.post("/:id/approve", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.approve(id, Number(req.auth.sub)));
  });

  // A reason is required — see RejectSchema and the DB check constraint.
  app.post("/:id/reject", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { reason } = RejectSchema.parse(req.body);
    return reply.send(await service.reject(id, Number(req.auth.sub), reason));
  });

  app.post("/:id/pause", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.pause(id, Number(req.auth.sub)));
  });
}

export { PaginationSchema };
