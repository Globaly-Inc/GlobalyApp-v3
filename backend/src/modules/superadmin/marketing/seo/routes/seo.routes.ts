// SEO/AEO dashboard routes — same role-check convention as the blog module (this module has no
// parent role guard, so every route checks super_admin explicitly).

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../../shared/errors.js";
import * as actionPlanService from "../services/action-plan.service.js";
import * as readinessService from "../services/aeo-readiness.service.js";
import * as rankingsService from "../services/rankings.service.js";
import * as suggestionsService from "../services/suggestions.service.js";
import * as gscClient from "../lib/gsc-client.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage SEO/AEO");
}

export async function seoRoutes(app: FastifyInstance) {
  app.get("/status", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    return reply.send({ connected: await gscClient.checkConnection() });
  });

  // Rankings read from cached snapshots (populated by the daily worker), never GSC live — so
  // this stays available (with a stale banner) even when GSC is unreachable or unconfigured.
  app.get("/rankings", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    return reply.send(await rankingsService.getRankings());
  });

  app.get("/suggestions", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    return reply.send({ suggestions: await suggestionsService.getSuggestions() });
  });

  app.get("/readiness", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    return reply.send({ readiness: await readinessService.getReadinessForPublishedBlogs() });
  });

  app.post("/action-plan", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    return reply.send({ plan: await actionPlanService.generateActionPlan() });
  });
}
