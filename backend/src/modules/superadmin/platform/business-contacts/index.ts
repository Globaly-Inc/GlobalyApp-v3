// Business-contacts sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { businessContactsRoutes } from "./routes/business-contacts.routes.js";

export default async function businessContactsModule(app: FastifyInstance) {
  app.register(businessContactsRoutes);
}
