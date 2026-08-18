// Events module — events, ticketing, registrations, and paid checkout.
//
// Two exports because the surface splits across two authentication regimes:
//
//   eventsModule       — everything that needs a JWT (attendee actions, host
//                        management, admin monitoring). Register inside the
//                        server's protected scope.
//   publicEventsModule — anonymous browse + the Stripe webhook, which is
//                        authenticated by HMAC and cannot carry a JWT. Register
//                        at the server root, like blogModule and billingModule.

import type { FastifyInstance } from "fastify";
import { publicEventRoutes, myEventRoutes } from "./routes/public-events.routes.js";
import { eventPaymentRoutes, eventWebhookRoutes } from "./routes/payments.routes.js";
import { hostEventRoutes } from "./routes/host-events.routes.js";
import { adminEventRoutes } from "./routes/admin-events.routes.js";

export default async function eventsModule(app: FastifyInstance) {
  await app.register(myEventRoutes, { prefix: "/api/v3/events" });
  await app.register(eventPaymentRoutes, { prefix: "/api/v3/events" });
  await app.register(hostEventRoutes, { prefix: "/api/v3/business/events" });
  await app.register(adminEventRoutes, { prefix: "/api/v3/admin/events" });
}

export async function publicEventsModule(app: FastifyInstance) {
  await app.register(eventWebhookRoutes, { prefix: "/api/v3/events" });
  await app.register(publicEventRoutes, { prefix: "/api/v3/events" });
}
