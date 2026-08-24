// Integrations module — business webhook subscription settings. dispatch() in
// services/webhooks.service.ts is ready for other modules to call on their own events; nothing
// calls it yet, which is a separate wiring step per source module.

import type { FastifyInstance } from "fastify";
import { webhooksRoutes } from "./routes/webhooks.routes.js";

export default async function integrationsModule(app: FastifyInstance) {
  app.register(webhooksRoutes, { prefix: "/api/v3/integrations" });
}
