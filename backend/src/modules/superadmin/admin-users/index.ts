// Admin-users sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { adminUsersRoutes } from "./routes/admin-users.routes.js";

export default async function adminUsersModule(app: FastifyInstance) {
  app.register(adminUsersRoutes);
}
