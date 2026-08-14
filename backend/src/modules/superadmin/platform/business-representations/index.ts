// Business-representations sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { businessRepresentationsRoutes } from "./routes/business-representations.routes.js";

export default async function businessRepresentationsModule(app: FastifyInstance) {
  app.register(businessRepresentationsRoutes);
}
