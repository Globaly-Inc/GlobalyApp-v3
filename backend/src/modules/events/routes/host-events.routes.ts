// Prefix: /api/v3/business/events — the hosting business's own events.
//
// Guard is requireBusinessContext on every route. The host identity comes from
// req.business (resolved by the tenant plugin from the JWT's orgId), never from
// the body or the query, and host.service.requireOwnEvent() turns any attempt to
// touch another org's event into a 404.
//
// ponytail: requirePermission() is deliberately NOT used, for the same reason
// businesses/routes/services.routes.ts gives — the per-tenant permissions tables
// have no seeder yet, so any permission check would 403 everyone.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { ForbiddenError } from "../../../shared/errors.js";
import * as host from "../services/host.service.js";
import {
  CheckInSchema,
  CreateEventSchema,
  CreateTicketSchema,
  CreateUpdateSchema,
  HostEventsQuerySchema,
  IdParamSchema,
  RegistrationsQuerySchema,
  TicketParamSchema,
  UpdateEventSchema,
  UpdateTicketSchema,
} from "../schemas/events.schema.js";
import type { FastifyRequest } from "fastify";

/** The caller's own org, straight from the resolved tenant — never from the body. */
function hostRef(req: FastifyRequest): host.HostRef {
  // requireBusinessContext already ran; this is the type-level restatement of it.
  if (!req.business) throw new ForbiddenError("Switch to a business context first");
  return { org_type: "business", org_id: Number(req.business.id) };
}

export async function hostEventRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const query = HostEventsQuerySchema.parse(req.query ?? {});
    return reply.send(await host.listOwn(hostRef(req), query));
  });

  app.post("/", async (req, reply) => {
    const input = CreateEventSchema.parse(req.body);
    const created = await host.create(input, hostRef(req), Number(req.auth.sub));
    return reply.status(201).send(created);
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await host.getOwn(id, hostRef(req)));
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = UpdateEventSchema.parse(req.body ?? {});
    return reply.send(await host.update(id, input, hostRef(req)));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await host.remove(id, hostRef(req));
    return reply.status(204).send();
  });

  // ── tickets ──
  app.get("/:id/tickets", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await host.listOwnTickets(id, hostRef(req)));
  });

  app.post("/:id/tickets", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CreateTicketSchema.parse(req.body);
    return reply.status(201).send(await host.createTicket(id, input, hostRef(req)));
  });

  app.patch("/:id/tickets/:ticketId", async (req, reply) => {
    const { id, ticketId } = TicketParamSchema.parse(req.params);
    const input = UpdateTicketSchema.parse(req.body ?? {});
    return reply.send(await host.updateTicket(id, ticketId, input, hostRef(req)));
  });

  app.delete("/:id/tickets/:ticketId", async (req, reply) => {
    const { id, ticketId } = TicketParamSchema.parse(req.params);
    await host.removeTicket(id, ticketId, hostRef(req));
    return reply.status(204).send();
  });

  // ── registrations ──
  app.get("/:id/registrations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const query = RegistrationsQuerySchema.parse(req.query ?? {});
    return reply.send(await host.listRegistrations(id, hostRef(req), query));
  });

  app.patch("/registrations/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { status } = CheckInSchema.parse(req.body);
    return reply.send(await host.setRegistrationStatus(id, status, hostRef(req)));
  });

  // ── updates ──
  app.get("/:id/updates", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await host.listOwnUpdates(id, hostRef(req)));
  });

  app.post("/:id/updates", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CreateUpdateSchema.parse(req.body);
    const created = await host.postUpdate(id, input, hostRef(req), Number(req.auth.sub));
    return reply.status(201).send(created);
  });
}
