import type { FastifyInstance } from "fastify";
import { subscriberRoutes } from "./routes/subscribers.routes.js";

// Unified subscribers listing — newsletter + early interest + guide leads (Track D).
export default async function subscribersAdminModule(app: FastifyInstance) {
  app.register(subscriberRoutes, { prefix: "/admin/marketing" });
}
