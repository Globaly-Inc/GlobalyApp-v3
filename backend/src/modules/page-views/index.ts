// Page views module — the visit counter on public business and service detail pages.
//
// Registered outside the protected scope in server.ts, so these routes never acquire the auth hook.

import type { FastifyInstance } from "fastify";
import { pageViewsRoutes } from "./routes/page-views.routes.js";

export default async function publicPageViewsModule(app: FastifyInstance) {
  app.register(pageViewsRoutes, { prefix: "/api/v3" });
}
