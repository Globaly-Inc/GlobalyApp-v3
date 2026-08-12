import type { FastifyInstance } from "fastify";
import { notificationRoutes } from "./routes/notifications.routes.js";

export default async function notificationsModule(app: FastifyInstance) {
  app.register(notificationRoutes, { prefix: "/api/v3/notifications" });
}
