// Public browse (unauthenticated) — the register/unregister actions still need auth, so they stay
// under the protected registration below despite living in the same file.

import type { FastifyInstance } from "fastify";
import { EventIdParamSchema, PublicEventsQuerySchema } from "../schemas/events.schema.js";
import { buildPaginatedResponse } from "../../../shared/pagination.js";
import * as service from "../services/events.service.js";

export async function publicEventsRoutes(app: FastifyInstance) {
  app.get("/events", async (req, reply) => {
    const pagination = PublicEventsQuerySchema.parse(req.query);
    const { rows, total } = await service.listPublished(pagination);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/events/:eventId", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const event = await service.getPublic(eventId);
    return reply.send(event);
  });
}
