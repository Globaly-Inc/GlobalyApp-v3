import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../core/plugins/auth.plugin.js";
import adminUsersModule from "./admin-users/index.js";
import dataExtractionModule from "./data-extraction/index.js";
import aiKnowledgeModule from "./ai-knowledge/index.js";
import { analyticsRoutes } from "./analytics/analytics.routes.js";
import platformModule from "./platform/index.js";
import blogModule from "./marketing/blog/index.js";
import guidesAdminModule from "./marketing/guides/index.js";
import seoAdminModule from "./marketing/seo/index.js";
import subscribersAdminModule from "./marketing/subscribers/index.js";
import monitoringModule from "./monitoring/index.js";
import settingsAdminModule from "./settings/index.js";

export default async function superadminModule(app: FastifyInstance) {
  // admin-users handles requireAdmin per-route (has public invite/accept endpoint)
  app.register(adminUsersModule, { prefix: "/api/v3/admin" });

  // Fully admin-only modules — guard at registration level
  app.register(async (scoped) => {
    scoped.addHook("onRequest", requireAdmin);
    scoped.register(analyticsRoutes, { prefix: "/api/v3/admin/analytics" });
    scoped.register(platformModule, { prefix: "/api/v3/admin/platform" });
    scoped.register(dataExtractionModule, { prefix: "/api/v3/admin/data-extraction" });
    scoped.register(blogModule, { prefix: "/api/v3/admin/marketing/blog" });
    scoped.register(guidesAdminModule, { prefix: "/api/v3/admin/marketing/guides" });
    scoped.register(seoAdminModule, { prefix: "/api/v3/admin/marketing/seo" });
    scoped.register(subscribersAdminModule, { prefix: "/api/v3/admin/marketing/subscribers" });
    scoped.register(aiKnowledgeModule, { prefix: "/api/v3/admin/ai-knowledge" });
    scoped.register(monitoringModule, { prefix: "/api/v3/admin/monitoring" });
    scoped.register(settingsAdminModule, { prefix: "/api/v3/admin/settings" });
  });
}
