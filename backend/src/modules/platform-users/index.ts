// Platform-users module — registration, profile, qualifications, tests, work experience, files.

import type { FastifyInstance } from "fastify";
import { platformUserRoutes } from "./routes/platform-users.routes.js";
import { platformUserFileRoutes } from "./routes/files.routes.js";

export default async function platformUsersModule(app: FastifyInstance) {
  app.register(platformUserRoutes, { prefix: "/api/v3/platform-users" });
  app.register(platformUserFileRoutes, { prefix: "/api/v3/platform-users" });
}
