import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { CreateEventSchema, EventIdParamSchema, UpdateEventSchema } from "../schemas/events.schema.js";
import * as service from "../services/events.service.js";

export async function eventsRoutes(app: FastifyInstance) {
  app.get("/events", { preHandler: requireBusinessContext }, async (req, reply) => {
    const events = await service.listForBusiness(req.businessId);
    return reply.send(events);
  });

  app.post("/events", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = CreateEventSchema.parse(req.body);
    const event = await service.create(req.businessId, input);
    return reply.status(201).send(event);
  });

  app.get("/events/:eventId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const event = await service.getOne(eventId, req.businessId);
    return reply.send(event);
  });

  app.patch("/events/:eventId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const input = UpdateEventSchema.parse(req.body);
    const event = await service.update(eventId, req.businessId, input);
    return reply.send(event);
  });

  app.delete("/events/:eventId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    await service.remove(eventId, req.businessId);
    return reply.status(204).send();
  });

  app.get("/events/:eventId/registrants", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const registrants = await service.listRegistrants(eventId, req.businessId);
    return reply.send(registrants);
  });
}
