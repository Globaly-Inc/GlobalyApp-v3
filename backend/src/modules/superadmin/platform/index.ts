// Platform management module — businesses, users, categories, countries, feature flags, site access.
// All routes require super_admin or data_admin role.

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import { ALLOWED_ROLES } from "../consts.js";
import { adminUserRoutes } from "./routes/users.routes.js";
import { adminCountryRoutes } from "./routes/countries.routes.js";
import { adminFeatureFlagRoutes } from "./routes/feature-flags.routes.js";
import { adminPlacesRoutes } from "./routes/places.routes.js";
import categoriesModule from "./categories/index.js";
import { adminOtherServicesRoutes } from "./routes/other-services.routes.js";
import businessesModule from "./businesses/index.js";
import businessBranchesModule from "./business-branches/index.js";
import businessServicesModule from "./business-services/index.js";
import businessPartnersModule from "./business-partners/index.js";
import businessRepresentationsModule from "./business-representations/index.js";

export default async function platformModule(app: FastifyInstance) {
  // Guard: super_admin or data_admin
  app.addHook("onRequest", async (req) => {
    if (!req.auth?.role || !(ALLOWED_ROLES as readonly string[]).includes(req.auth.role)) {
      throw new ForbiddenError("Only super_admin or data_admin can access platform management");
    }
  });

  app.register(adminUserRoutes);
  app.register(adminCountryRoutes);
  app.register(adminFeatureFlagRoutes);
  app.register(adminPlacesRoutes);
  app.register(categoriesModule);
  app.register(adminOtherServicesRoutes); // read-only oversight of Earn → My Services
  app.register(businessesModule);
  app.register(businessBranchesModule);
  app.register(businessServicesModule);
  app.register(businessPartnersModule);
  app.register(businessRepresentationsModule);
}
