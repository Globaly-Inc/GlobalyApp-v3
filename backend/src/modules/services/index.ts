// Earn → My Services. A seller's listings plus the lifecycle of orders placed against them.
//
// Order *creation* is not here: a buyer acquires a service on the public marketplace, which this phase does
// not build. This module owns everything after an order exists.

import type { FastifyInstance } from "fastify";
import { myServicesRoutes } from "./routes/my-services.routes.js";
import { publicServicesRoutes } from "./routes/public-services.routes.js";

export default async function servicesModule(app: FastifyInstance) {
  // Two prefixes, so public and authenticated routes are separated by file rather than by convention.
  app.register(publicServicesRoutes, { prefix: "/api/v3/services" });
  app.register(myServicesRoutes, { prefix: "/api/v3/my-services" });
}
