// Prefix: /api/v3/events — the attendee-facing surface.
// Browse and detail are public; anything that names "me" needs the JWT, which
// the enclosing scope has already verified.

import type { FastifyInstance } from "fastify";
import { PaginationSchema } from "../../../shared/pagination.js";
import * as events from "../services/events.service.js";
import * as registrations from "../services/registrations.service.js";
import {
  BrowseEventsQuerySchema,
  IdOrSlugParamSchema,
  IdParamSchema,
  RegisterSchema,
} from "../schemas/events.schema.js";

/** Unauthenticated reads. Registered at the server root, outside the JWT scope. */
export async function publicEventRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = BrowseEventsQuerySchema.parse(req.query ?? {});
    return reply.send(await events.browse(query));
  });

  app.get("/:idOrSlug", async (req, reply) => {
    const { idOrSlug } = IdOrSlugParamSchema.parse(req.params);
    return reply.send(await events.getPublic(idOrSlug));
  });

  app.get("/:id/tickets", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await events.listPublicTickets(id));
  });

  app.get("/:id/co-hosts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await events.listPublicCoHosts(id));
  });

  app.get("/:id/updates", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await events.listPublicUpdates(id));
  });
}

/** Attendee actions. Registered inside the JWT scope. */
export async function myEventRoutes(app: FastifyInstance) {
  app.get("/me/registrations", async (req, reply) => {
    const query = PaginationSchema.parse(req.query ?? {});
    return reply.send(await registrations.listMine(Number(req.auth.sub), query));
  });

  // Free tickets and plain RSVPs only — a paid ticket must go through checkout.
  app.post("/:id/registrations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = RegisterSchema.parse(req.body ?? {});
    const row = await registrations.register(id, Number(req.auth.sub), input);
    return reply.status(201).send(row);
  });

  app.delete("/me/registrations/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await registrations.cancel(id, Number(req.auth.sub));
    return reply.status(204).send();
  });
}
