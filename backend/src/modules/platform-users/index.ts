// Platform-users module — registration, profile, qualifications, tests, work experience, files.

import type { FastifyInstance } from "fastify";
import { platformUserRoutes } from "./routes/platform-users.routes.js";
import { platformUserFileRoutes } from "./routes/files.routes.js";
import { institutionClaimRoutes } from "./routes/institution-claim.routes.js";

export default async function platformUsersModule(app: FastifyInstance) {
  app.register(platformUserRoutes, { prefix: "/api/v3/platform-users" });
  app.register(platformUserFileRoutes, { prefix: "/api/v3/platform-users" });
  // Institutions live in this module (onboardInstitution), so their claim flow does too.
  app.register(institutionClaimRoutes, { prefix: "/api/v3/institutions" });
}
