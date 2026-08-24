import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/events.service.js";
import {
  EventInputSchema,
  EventPatchInputSchema,
  EventIdParamSchema,
  ListEventsQuerySchema,
  CancelEventSchema,
  TicketInputSchema,
  TicketPatchInputSchema,
  TicketIdParamSchema,
  RegistrationInputSchema,
  RegistrationIdParamSchema,
  CheckInInputSchema,
  CoHostInviteSchema,
  CoHostIdParamSchema,
  CoHostRespondSchema,
  UpdateInputSchema,
} from "../schemas/events.schema.js";

export async function businessEventsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  // ── Events ──
  app.get("/business-events", async (req, reply) => {
    const { page, limit, status, search } = ListEventsQuerySchema.parse(req.query);
    return reply.send(await service.listEvents(req.db, { page, limit }, { status, search }));
  });

  app.get("/business-events/:eventId", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    return reply.send(await service.getEvent(req.db, eventId));
  });

  app.post("/business-events", async (req, reply) => {
    const input = EventInputSchema.parse(req.body);
    const event = await service.createEvent(req.db, Number(req.auth.sub), input);
    return reply.status(201).send(event);
  });

  app.patch("/business-events/:eventId", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const input = EventPatchInputSchema.parse(req.body);
    return reply.send(await service.updateEvent(req.db, eventId, input));
  });

  app.post("/business-events/:eventId/cancel", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const { reason } = CancelEventSchema.parse(req.body ?? {});
    return reply.send(await service.cancelEvent(req.db, eventId, reason));
  });

  app.delete("/business-events/:eventId", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    await service.deleteEvent(req.db, eventId);
    return reply.status(204).send();
  });

  // ── Tickets ──
  app.get("/business-events/:eventId/tickets", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    return reply.send(await service.listTickets(req.db, eventId));
  });

  app.post("/business-events/:eventId/tickets", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const input = TicketInputSchema.parse(req.body);
    return reply.status(201).send(await service.createTicket(req.db, eventId, input));
  });

  app.patch("/business-events/:eventId/tickets/:ticketId", async (req, reply) => {
    const { eventId, ticketId } = TicketIdParamSchema.parse(req.params);
    const input = TicketPatchInputSchema.parse(req.body);
    return reply.send(await service.updateTicket(req.db, eventId, ticketId, input));
  });

  app.delete("/business-events/:eventId/tickets/:ticketId", async (req, reply) => {
    const { eventId, ticketId } = TicketIdParamSchema.parse(req.params);
    await service.deleteTicket(req.db, eventId, ticketId);
    return reply.status(204).send();
  });

  // ── Registrations ──
  app.get("/business-events/:eventId/registrations", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    return reply.send(await service.listRegistrations(req.db, eventId));
  });

  app.post("/business-events/:eventId/registrations", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const input = RegistrationInputSchema.parse(req.body);
    return reply.status(201).send(await service.registerAttendee(req.db, eventId, input));
  });

  app.post("/business-events/:eventId/registrations/:registrationId/cancel", async (req, reply) => {
    const { eventId, registrationId } = RegistrationIdParamSchema.parse(req.params);
    return reply.send(await service.cancelRegistration(req.db, eventId, registrationId));
  });

  app.post("/business-events/:eventId/registrations/:registrationId/check-in", async (req, reply) => {
    const { eventId, registrationId } = RegistrationIdParamSchema.parse(req.params);
    const { checkIn } = CheckInInputSchema.parse(req.body);
    return reply.send(await service.checkInRegistrant(req.db, eventId, registrationId, checkIn));
  });

  // ── Co-hosts ──
  app.get("/business-events/:eventId/co-hosts", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    return reply.send(await service.listCoHosts(req.db, eventId));
  });

  app.post("/business-events/:eventId/co-hosts", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const { host_business_id, role } = CoHostInviteSchema.parse(req.body);
    return reply.status(201).send(await service.inviteCoHost(req.db, eventId, Number(req.auth.sub), host_business_id, role));
  });

  app.post("/business-events/:eventId/co-hosts/:coHostId/respond", async (req, reply) => {
    const { eventId, coHostId } = CoHostIdParamSchema.parse(req.params);
    const { accept } = CoHostRespondSchema.parse(req.body);
    return reply.send(await service.respondCoHostInvite(req.db, eventId, coHostId, accept));
  });

  // ── Updates ──
  app.get("/business-events/:eventId/updates", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    return reply.send(await service.listUpdates(req.db, eventId));
  });

  app.post("/business-events/:eventId/updates", async (req, reply) => {
    const { eventId } = EventIdParamSchema.parse(req.params);
    const { title, content } = UpdateInputSchema.parse(req.body);
    return reply.status(201).send(await service.createUpdate(req.db, eventId, Number(req.auth.sub), title, content));
  });
}
