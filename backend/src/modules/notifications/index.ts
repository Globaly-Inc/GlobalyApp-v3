// Notifications module — per-user inbox, channel preferences, push-token registry.
// Registered inside the server's protected scope: every route needs a JWT and
// none of them needs a business context.

import type { FastifyInstance } from "fastify";
import { notificationRoutes } from "./routes/notifications.routes.js";

export default async function notificationsModule(app: FastifyInstance) {
  await app.register(notificationRoutes, { prefix: "/api/v3/notifications" });
}

export { publish } from "./services/notifications.service.js";
export { fanout } from "./services/fanout.service.js";
