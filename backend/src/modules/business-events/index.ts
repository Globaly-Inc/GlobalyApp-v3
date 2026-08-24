// Business Events module — core management (list/create/edit/cancel events,
// tickets, free RSVP registrations + check-in, co-hosts, updates). No
// Stripe/payment integration in this scope.

import type { FastifyInstance } from "fastify";
import { businessEventsRoutes } from "./routes/events.routes.js";

export default async function businessEventsModule(app: FastifyInstance) {
  app.register(businessEventsRoutes, { prefix: "/api/v3" });
}
