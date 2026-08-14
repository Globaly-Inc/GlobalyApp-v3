// Business-branches sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { businessBranchesRoutes } from "./routes/business-branches.routes.js";

export default async function businessBranchesModule(app: FastifyInstance) {
  app.register(businessBranchesRoutes);
}
