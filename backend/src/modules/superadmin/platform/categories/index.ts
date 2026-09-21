// Categories sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { categoryRoutes } from "./routes/categories.routes.js";
import { catalogRoutes } from "./routes/catalog.routes.js";
import { registrationTypeRoutes } from "./routes/registration-types.routes.js";

export default async function categoriesModule(app: FastifyInstance) {
  app.register(categoryRoutes);
  app.register(catalogRoutes);
  app.register(registrationTypeRoutes);
}
