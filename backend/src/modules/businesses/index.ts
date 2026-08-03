// Business module — registration, profile management.

import type { FastifyInstance } from "fastify";
import { businessRoutes } from "./routes/businesses.routes.js";

export default async function businessesModule(app: FastifyInstance) {
  app.register(businessRoutes, { prefix: "/api/v3/businesses" });
}
