// Platform management module — businesses, users, categories, countries, feature flags, site access.
// All routes require super_admin or data_admin role.

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import { ALLOWED_ROLES } from "../consts.js";
import { adminBusinessRoutes } from "./routes/businesses.routes.js";
import { adminUserRoutes } from "./routes/users.routes.js";
import { adminCountryRoutes } from "./routes/countries.routes.js";
import { adminFeatureFlagRoutes } from "./routes/feature-flags.routes.js";
import categoriesModule from "./categories/index.js";
import { adminServicesRoutes } from "./routes/services.routes.js";

export default async function platformModule(app: FastifyInstance) {
  // Guard: super_admin or data_admin
  app.addHook("onRequest", async (req) => {
    if (!req.auth?.role || !(ALLOWED_ROLES as readonly string[]).includes(req.auth.role)) {
      throw new ForbiddenError("Only super_admin or data_admin can access platform management");
    }
  });

  app.register(adminBusinessRoutes);
  app.register(adminUserRoutes);
  app.register(adminCountryRoutes);
  app.register(adminFeatureFlagRoutes);
  app.register(categoriesModule);
  app.register(adminServicesRoutes); // read-only oversight of Earn → My Services
}
