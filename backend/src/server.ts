// Application entry point — builds Fastify instance, registers plugins and modules, starts server.

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { config } from "./config.js";

// Core plugins
import { errorHandlerPlugin } from "./core/plugins/error-handler.plugin.js";
import { requestContextPlugin } from "./core/plugins/request-context.plugin.js";
import { authPlugin } from "./core/plugins/auth.plugin.js";
import { tenantPlugin } from "./core/plugins/tenant.plugin.js";
import { startEvictionLoop, shutdownAll } from "./core/db/pool-manager.js";
import { masterKnex } from "./core/db/master-pool.js";
import { closeCache } from "./core/cache/dragonfly.js";
import { createChildLogger } from "./shared/logger.js";

// Modules
import authModule from "./modules/auth/index.js";
import superadminModule from "./modules/superadmin/index.js";
import platformUsersModule, { publicPlatformUsersModule } from "./modules/platform-users/index.js";
import businessesModule from "./modules/businesses/index.js";
import placesModule from "./modules/places/index.js";
import agentsModule from "./modules/agents/index.js";
import feedModule from "./modules/feed/index.js";
import blogModule from "./modules/blog/index.js";
import otherServicesModule, { publicServicesModule } from "./modules/other-services/index.js";
import geoModule from "./modules/geo/index.js";
import searchModule from "./modules/search/index.js";
import scholarshipsPublicModule from "./modules/scholarships/index.js";
import aiCounsellorModule, { publicAiCounsellorModule } from "./modules/ai-counsellor/index.js";
import enquiriesModule from "./modules/enquiries/index.js";
import coursesModule from "./modules/courses/index.js";
import savedItemsModule from "./modules/saved-items/index.js";
import referralsModule, { publicReferralsModule } from "./modules/referrals/index.js";
import waitlistModule from "./modules/waitlist/index.js";

const logger = createChildLogger("server");

export async function buildServer() {
  const app = Fastify({ logger: true });

  // --- Framework plugins ---
  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: config.GCS_MAX_FILE_SIZE_MB * 1024 * 1024 } });
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);

  await app.register(async (protectedApp) => {
    await protectedApp.register(authPlugin);
    await protectedApp.register(tenantPlugin);

    await protectedApp.register(authModule);         // unified OTP login for all user types
    await protectedApp.register(superadminModule);   // admin users + data extraction
    await protectedApp.register(platformUsersModule); // platform user profiles + sub-resources
    await protectedApp.register(businessesModule);   // business registration + profiles
    await protectedApp.register(placesModule);       // address autocomplete for self-service profile forms
    await protectedApp.register(agentsModule);       // agent invitations + management (per-business DB)
    await protectedApp.register(feedModule);          // cross-portal social feed
    await protectedApp.register(otherServicesModule);      // service listings, orders, reviews
    await protectedApp.register(aiCounsellorModule);   // AI counsellor — chat, credits, sessions, embed configs
    await protectedApp.register(enquiriesModule);      // student enquiry creation + lookup
    await protectedApp.register(coursesModule);        // student course browse (extracted courses)
    await protectedApp.register(savedItemsModule);     // heart/shortlist of courses + institutions
    await protectedApp.register(referralsModule);           // Earn → Referrals: own code, stats, history
  });

  await app.register(blogModule);            // public blog reads (no auth)
  await app.register(publicServicesModule);  // public marketplace browse (no auth)
  await app.register(geoModule);              // public geo reads (no auth)
  await app.register(publicPlatformUsersModule); // public country/city lookups (no auth)
  await app.register(searchModule);          // public search reads (no auth)
  await app.register(scholarshipsPublicModule); // public scholarships reads (no auth)
  await app.register(publicAiCounsellorModule); // guest + embed-widget AI chat (no auth)
  // Reward config + the /join code lookup. Registered outside the protected scope so these two routes
  // never acquire the auth hook — public by construction, not by an allow-list.
  await app.register(publicReferralsModule);
  await app.register(waitlistModule);        // coming-soon page sign-up (no auth)

  // --- Health checks ---
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/health/database", async () => {
    try {
      await masterKnex.raw("SELECT 1 AS ok");
      return { status: "ok", details: { host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME } };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/health/queue", async () => {
    try {
      const amqp = await import("amqplib");
      const conn = await amqp.connect(config.LAVINMQ_URL);
      await conn.close();
      return { status: "ok", details: { url: config.LAVINMQ_URL.replace(/\/\/.*@/, "//***@") } };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/health/mail", async () => {
    const { mailerService } = await import("./shared/mail/mailerService.js");
    const ok = await mailerService.verifyConnection();
    return {
      status: ok ? "ok" : "degraded",
      details: { smtp_host: config.MAIL_HOST ?? null, configured: !!config.MAIL_HOST },
    };
  });

  app.get("/health/cache", async () => {
    const { getCache } = await import("./core/cache/dragonfly.js");
    const cache = getCache();
    if (!cache) return { status: "disabled", details: { configured: false } };
    try {
      await cache.ping();
      return { status: "ok", details: { configured: true } };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/health/detailed", async () => {
    const start = Date.now();

    const [db, queue, mail] = await Promise.allSettled([
      masterKnex.raw("SELECT 1 AS ok").then(() => ({ status: "ok" as const })),
      import("amqplib").then(async (amqp) => {
        const conn = await amqp.connect(config.LAVINMQ_URL);
        await conn.close();
        return { status: "ok" as const };
      }),
      import("./shared/mail/mailerService.js").then(async ({ mailerService }) => {
        const ok = await mailerService.verifyConnection();
        return { status: ok ? "ok" as const : "degraded" as const };
      }),
    ]);

    const pick = (r: PromiseSettledResult<{ status: string }>) =>
      r.status === "fulfilled" ? r.value : { status: "error", error: (r.reason as Error)?.message };

    const services = { database: pick(db), queue: pick(queue), mail: pick(mail) };
    const overall = Object.values(services).every((s) => s.status === "ok") ? "ok"
      : Object.values(services).some((s) => s.status === "error") ? "error" : "degraded";

    return {
      status: overall,
      uptime_s: Math.floor(process.uptime()),
      latency_ms: Date.now() - start,
      services,
      memory: {
        rss_mb: Math.round(process.memoryUsage().rss / 1048576),
        heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
      },
    };
  });

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
  await closeCache();
  await masterKnex.destroy();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen({ port: config.PORT, host: "0.0.0.0" });
