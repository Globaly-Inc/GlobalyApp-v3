import type { FastifyInstance } from "fastify";
import { cached } from "../../../core/cache/dragonfly.js";
import * as repo from "../repositories/stats.repository.js";

/** Counts move only as admins publish, so a short TTL keeps five aggregates off the hot path. */
const TTL_SECONDS = 300;

/**
 * Public because the marketing home page and /for-institutions both render the stat bar for
 * signed-out visitors. Response is an explicit object built by the repository — no DB row is
 * spread into the reply.
 */
export async function platformStatsRoutes(app: FastifyInstance) {
  app.get("/platform-stats", async (_req, reply) => {
    const stats = await cached("public:platform-stats", TTL_SECONDS, repo.getPlatformStats);
    return reply.send(stats);
  });
}
