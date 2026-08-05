// Application entry point — builds Fastify instance, registers plugins and modules, starts server.

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";

// Core plugins
import { errorHandlerPlugin } from "./core/plugins/error-handler.plugin.js";
import { requestContextPlugin } from "./core/plugins/request-context.plugin.js";
import { authPlugin } from "./core/plugins/auth.plugin.js";
import { tenantPlugin } from "./core/plugins/tenant.plugin.js";
import { startEvictionLoop, shutdownAll } from "./core/db/pool-manager.js";
import { masterKnex } from "./core/db/master-pool.js";
import { createChildLogger } from "./shared/logger.js";

// Modules
import authModule from "./modules/auth/index.js";
import superadminModule from "./modules/superadmin/index.js";
import platformUsersModule from "./modules/platform-users/index.js";
import businessesModule from "./modules/businesses/index.js";
import agentsModule from "./modules/agents/index.js";

const logger = createChildLogger("server");

export async function buildServer() {
  const app = Fastify({ logger: true });

  // --- Framework plugins ---
  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // --- Modules ---
  await app.register(authModule);           // unified OTP login for all user types
  await app.register(superadminModule);     // admin users + data extraction
  await app.register(platformUsersModule);   // platform user profiles + sub-resources
  await app.register(businessesModule);     // business registration + profiles
  await app.register(agentsModule);         // agent auth + management (per-business DB)

  // --- Health check ---
  app.get("/healthz", async () => ({ status: "ok" }));

  // Start pool eviction loop
  startEvictionLoop();

  return app;
}

// --- Start server ---
const app = await buildServer();

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  await app.close();
  await shutdownAll();
  await masterKnex.destroy();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen({ port: config.PORT, host: "0.0.0.0" });
