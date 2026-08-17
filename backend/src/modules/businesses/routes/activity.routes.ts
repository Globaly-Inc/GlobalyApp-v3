// Business-side activity feed routes — what the business's own team did.

import type { FastifyInstance } from "fastify";
import { PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/activity.service.js";

export async function businessActivityRoutes(app: FastifyInstance) {
  app.get("/activity", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    return reply.send(await service.listActivity(req.db, pagination));
  });
}
