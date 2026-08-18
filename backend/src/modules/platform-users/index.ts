// Platform-users module — registration, profile, qualifications, tests, work experience, files.

import type { FastifyInstance } from "fastify";
import { platformUserRoutes } from "./routes/platform-users.routes.js";
import { platformUserFileRoutes } from "./routes/files.routes.js";
import { publicStudentProfileRoutes } from "./routes/public-profiles.routes.js";

export default async function platformUsersModule(app: FastifyInstance) {
  app.register(platformUserRoutes, { prefix: "/api/v3/platform-users" });
  app.register(platformUserFileRoutes, { prefix: "/api/v3/platform-users" });
}

/**
 * The anonymous read of a published student profile (Wave D4).
 *
 * Kept as its own export so it can be registered **before** authPlugin in server.ts, exactly
 * like publicServicesModule and publicEventsModule. authPlugin is an `fp()` plugin, so its
 * onRequest hook applies to everything registered after it — registering these routes earlier
 * means they simply never acquire it, and auth.plugin.ts needs no allow-list entry (which it
 * could not express anyway: the path carries a dynamic slug).
 *
 * The property this buys is structural: a route added here is unauthenticated by construction,
 * and one added to platformUserRoutes is authenticated by construction.
 */
export async function publicStudentProfilesModule(app: FastifyInstance) {
  app.register(publicStudentProfileRoutes, { prefix: "/api/v3" });
}
