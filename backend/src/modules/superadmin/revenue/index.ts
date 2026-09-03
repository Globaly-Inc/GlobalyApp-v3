import type { FastifyInstance } from "fastify";
import { adminCreditsRoutes } from "./credits.routes.js";

export default async function revenueModule(app: FastifyInstance) {
  app.register(adminCreditsRoutes);
}
