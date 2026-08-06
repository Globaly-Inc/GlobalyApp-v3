// Business module — registration, profile management, files.

import type { FastifyInstance } from "fastify";
import { businessRoutes } from "./routes/businesses.routes.js";
import { businessFileRoutes } from "./routes/files.routes.js";

export default async function businessesModule(app: FastifyInstance) {
  app.register(businessRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessFileRoutes, { prefix: "/api/v3/businesses" });
}
