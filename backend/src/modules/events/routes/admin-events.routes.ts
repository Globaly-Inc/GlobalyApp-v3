// Prefix: /api/v3/admin/events — platform-wide observability for
// frontend/src/app/admin/monitoring/events. Read-only by design.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import * as admin from "../services/admin.service.js";
import { AdminEventsQuerySchema, IdParamSchema, RegistrationsQuerySchema } from "../schemas/events.schema.js";

export async function adminEventRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await admin.stats()));

  app.get("/", async (req, reply) => {
    const query = AdminEventsQuerySchema.parse(req.query ?? {});
    return reply.send(await admin.list(query));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await admin.detail(id));
  });

  app.get("/:id/registrations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const query = RegistrationsQuerySchema.parse(req.query ?? {});
    return reply.send(await admin.registrations(id, query));
  });
}
