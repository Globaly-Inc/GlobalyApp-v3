// Business-services sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { businessServicesRoutes } from "./routes/business-services.routes.js";

export default async function businessServicesModule(app: FastifyInstance) {
  app.register(businessServicesRoutes);
}
