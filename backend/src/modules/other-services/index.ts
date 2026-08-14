// Earn → My Services. A seller's listings plus the lifecycle of orders placed against them.
//
// Order *creation* is not here: a buyer acquires a service on the public marketplace, which this phase does
// not build. This module owns everything after an order exists.

import type { FastifyInstance } from "fastify";
import { myServicesRoutes } from "./routes/my-services.routes.js";
import { publicServicesRoutes } from "./routes/public-services.routes.js";

export default async function servicesModule(app: FastifyInstance) {
  app.register(myServicesRoutes, { prefix: "/api/v3/my-services" });
}

/**
 * The public marketplace, registered as its own module.
 *
 * Kept separate so it can be registered **before** authPlugin in server.ts. authPlugin is an `fp()` plugin,
 * so its onRequest hook applies to everything registered after it — registering these routes earlier means
 * they simply never acquire it. That is why auth.plugin.ts needs no allow-list for them.
 *
 * The property this buys is structural rather than textual: a route added to this module is unauthenticated
 * by construction, and one added to myServicesRoutes is authenticated by construction. Neither can be got
 * wrong by mis-writing a path pattern, which is exactly how the earlier allow-list would have let a POST
 * through unauthenticated.
 */
export async function publicServicesModule(app: FastifyInstance) {
  app.register(publicServicesRoutes, { prefix: "/api/v3/services" });
}
