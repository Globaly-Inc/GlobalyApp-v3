// Builds the Fastify app for injection-based tests — no port binding, no live server.
//
// NOTE: src/server.ts calls buildServer() and app.listen() at module scope, so importing
// it from a test would start a real server. This mirrors the plugin/module wiring of the
// protected scope in buildServer(). When server.ts is refactored to export a side-effect-free
// factory, replace the body of buildTestApp() with a call to it.
//
// ponytail: @fastify/rate-limit is deliberately not registered — route-level rateLimit
// config is inert without it, which keeps multi-request tests deterministic. Add it back
// when rate limiting itself is under test.

import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";

import { errorHandlerPlugin } from "../../src/core/plugins/error-handler.plugin.js";
import { requestContextPlugin } from "../../src/core/plugins/request-context.plugin.js";
import { authPlugin } from "../../src/core/plugins/auth.plugin.js";
import { tenantPlugin } from "../../src/core/plugins/tenant.plugin.js";
import authModule from "../../src/modules/auth/index.js";
import platformUsersModule from "../../src/modules/platform-users/index.js";
import businessesModule from "../../src/modules/businesses/index.js";
import agentsModule from "../../src/modules/agents/index.js";
import { adminUsersRoutes } from "../../src/modules/superadmin/admin-users/routes/admin-users.routes.js";

export interface TestAppOptions {
  /**
   * Register the account modules too (platform-users, businesses, agents, admin-users).
   * Off by default so auth-only suites stay fast and narrowly scoped.
   * ponytail: data-extraction is deliberately excluded — it pulls in Gemini/Crawl4AI clients.
   */
  modules?: boolean;
}

export async function buildTestApp(options: TestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  if (options.modules) {
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  }
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);

  await app.register(async (protectedApp) => {
    await protectedApp.register(authPlugin);
    await protectedApp.register(tenantPlugin);
    await protectedApp.register(authModule);

    if (options.modules) {
      await protectedApp.register(platformUsersModule);
      await protectedApp.register(businessesModule);
      await protectedApp.register(agentsModule);
      await protectedApp.register(adminUsersRoutes, { prefix: "/api/v3/admin" });
    }
  });

  await app.ready();
  return app;
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
