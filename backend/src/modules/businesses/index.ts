// Business module — registration, profile management, files, branches, services,
// partners, activity, and members (aliased from the agents module).

import type { FastifyInstance } from "fastify";
import { businessRoutes } from "./routes/businesses.routes.js";
import { businessFileRoutes } from "./routes/files.routes.js";
import { businessBranchesRoutes } from "./routes/branches.routes.js";
import { businessServicesRoutes } from "./routes/services.routes.js";
import { businessLookupsRoutes } from "./routes/lookups.routes.js";
import { businessPartnersRoutes } from "./routes/partners.routes.js";
import { businessActivityRoutes } from "./routes/activity.routes.js";
import { businessDashboardRoutes } from "./routes/dashboard.routes.js";
import { agentBusinessRoutes } from "../agents/routes/agents.routes.js";

export default async function businessesModule(app: FastifyInstance) {
  app.register(businessRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessFileRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessBranchesRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessServicesRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessLookupsRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessPartnersRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessActivityRoutes, { prefix: "/api/v3/businesses" });
  app.register(businessDashboardRoutes, { prefix: "/api/v3/businesses" });
  app.register(agentBusinessRoutes, { prefix: "/api/v3/businesses/members" });
}
