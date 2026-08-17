import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../core/plugins/auth.plugin.js";
import adminUsersModule from "./admin-users/index.js";
import auditLogsModule from "./audit-logs/index.js";
import dataExtractionModule from "./data-extraction/index.js";
import aiKnowledgeModule from "./ai-knowledge/index.js";
import { analyticsRoutes } from "./analytics/analytics.routes.js";
import platformModule from "./platform/index.js";
import blogModule from "./marketing/blog/index.js";

export default async function superadminModule(app: FastifyInstance) {
  // admin-users handles requireAdmin per-route (has public invite/accept endpoint)
  app.register(adminUsersModule, { prefix: "/api/v3/admin" });

  // Fully admin-only modules — guard at registration level
  app.register(async (scoped) => {
    scoped.addHook("onRequest", requireAdmin);
    scoped.register(analyticsRoutes, { prefix: "/api/v3/admin/analytics" });
    scoped.register(auditLogsModule, { prefix: "/api/v3/admin/audit-logs" });
    scoped.register(platformModule, { prefix: "/api/v3/admin/platform" });
    scoped.register(dataExtractionModule, { prefix: "/api/v3/admin/data-extraction" });
    scoped.register(blogModule, { prefix: "/api/v3/admin/marketing/blog" });
    scoped.register(aiKnowledgeModule, { prefix: "/api/v3/admin/ai-knowledge" });
  });
}
