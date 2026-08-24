// Events module — business-run events (RSVP style; ticketed/paid events are a later step, matching
// how other-services' payments driver was introduced only once a real need existed).

import type { FastifyInstance } from "fastify";
import { eventsRoutes } from "./routes/events.routes.js";
import { registrationsRoutes } from "./routes/registrations.routes.js";
import { publicEventsRoutes } from "./routes/public-events.routes.js";

export default async function eventsModule(app: FastifyInstance) {
  app.register(eventsRoutes, { prefix: "/api/v3/events" });
  app.register(registrationsRoutes, { prefix: "/api/v3/events" });
}

/** Unauthenticated: public event browse. */
export async function publicEventsModule(app: FastifyInstance) {
  app.register(publicEventsRoutes, { prefix: "/api/v3/events" });
}
