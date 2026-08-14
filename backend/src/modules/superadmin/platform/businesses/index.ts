// Businesses sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { adminBusinessRoutes } from "./routes/businesses.routes.js";

export default async function businessesModule(app: FastifyInstance) {
  app.register(adminBusinessRoutes);
}
