import type { FastifyInstance } from "fastify";
import { integrationsRoutes } from "./routes/integrations.routes.js";
import { crmSyncRoutes } from "./routes/crm-sync.routes.js";

// Superadmin platform settings (integration credentials).
export default async function settingsAdminModule(app: FastifyInstance) {
  app.register(integrationsRoutes);
  app.register(crmSyncRoutes);
}
