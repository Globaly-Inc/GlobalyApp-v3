// Platform-users module — registration, profile, qualifications, tests, work experience, files.

import type { FastifyInstance } from "fastify";
import { platformUserRoutes } from "./routes/platform-users.routes.js";
import { platformUserFileRoutes } from "./routes/files.routes.js";
import { institutionClaimRoutes } from "./routes/institution-claim.routes.js";
import { institutionMemberInviteRoutes } from "./routes/institution-member-invite.routes.js";
import { institutionProfileRoutes } from "./routes/institution-profile.routes.js";
import { institutionFileRoutes } from "./routes/institution-files.routes.js";
import { institutionPartnersRoutes } from "./routes/institution-partners.routes.js";
import { institutionRolesRoutes } from "./routes/institution-roles.routes.js";
import { publicLookupRoutes } from "./routes/public-lookup.routes.js";

export default async function platformUsersModule(app: FastifyInstance) {
  app.register(platformUserRoutes, { prefix: "/api/v3/platform-users" });
  app.register(platformUserFileRoutes, { prefix: "/api/v3/platform-users" });
  // Institutions live in this module (onboardInstitution), so their claim flow does too.
  app.register(institutionClaimRoutes, { prefix: "/api/v3/institutions" });
  app.register(institutionMemberInviteRoutes, { prefix: "/api/v3/institutions" });
  app.register(institutionProfileRoutes, { prefix: "/api/v3/institutions" });
  app.register(institutionFileRoutes, { prefix: "/api/v3/institutions" });
  app.register(institutionPartnersRoutes, { prefix: "/api/v3/institutions" });
  app.register(institutionRolesRoutes, { prefix: "/api/v3/institutions/roles" });
}

/**
 * Public country/city lookups, registered as their own module so they can be registered
 */
export async function publicPlatformUsersModule(app: FastifyInstance) {
  app.register(publicLookupRoutes, { prefix: "/api/v3/platform-users" });
}
