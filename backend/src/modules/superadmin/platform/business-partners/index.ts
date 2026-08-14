// Business-partners sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { businessPartnersRoutes } from "./routes/business-partners.routes.js";

export default async function businessPartnersModule(app: FastifyInstance) {
  app.register(businessPartnersRoutes);
}
