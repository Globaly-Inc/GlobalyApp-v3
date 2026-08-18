// AI-embed widget module (§3.8).
//
// Registered at the ROOT of the server, like aiChatModule and billingModule,
// because the widget surface is called by third-party pages that cannot carry a
// JWT. The owner-facing config CRUD lives in this module's own authenticated
// sub-scope, which registers the same auth + tenant plugins the shared protected
// scope uses, so `req.auth` / `req.business` behave identically here.
//
// The widget routes' own credential is the embed key, and their authorization is
// the config's origin allowlist — see services/origin.service.ts.

import type { FastifyInstance } from "fastify";

import { authPlugin } from "../../core/plugins/auth.plugin.js";
import { tenantPlugin } from "../../core/plugins/tenant.plugin.js";
import { embedConfigRoutes } from "./routes/configs.routes.js";
import { widgetRoutes } from "./routes/widget.routes.js";

const PREFIX = "/api/v3/ai-embed";

export default async function aiEmbedModule(app: FastifyInstance) {
  // Unauthenticated, cross-origin, embed-key authenticated.
  await app.register(widgetRoutes, { prefix: PREFIX });

  await app.register(async (secured) => {
    await secured.register(authPlugin);
    await secured.register(tenantPlugin);
    await secured.register(embedConfigRoutes, { prefix: PREFIX });
  });
}
