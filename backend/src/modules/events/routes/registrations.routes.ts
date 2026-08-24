// Any authenticated platform user registering for a published event as themselves — no business
// context required.

import type { FastifyInstance } from "fastify";
import { EventIdParamSchema } from "../schemas/events.schema.js";
import * as service from "../services/registrations.service.js";

export async function registrationsRoutes(app: FastifyInstance) {
  app.post("/events/:eventId/register", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const registration = await service.register(eventId, Number(req.auth.sub));
    return reply.status(201).send(registration);
  });

  app.post("/events/:eventId/unregister", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const registration = await service.unregister(eventId, Number(req.auth.sub));
    return reply.send(registration);
  });
}
