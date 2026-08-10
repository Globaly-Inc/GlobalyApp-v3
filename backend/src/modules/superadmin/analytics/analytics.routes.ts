// Analytics routes — superadmin dashboard data.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ForbiddenError } from "../../../shared/errors.js";
import * as service from "./analytics.service.js";

const DashboardQuery = z.object({
  preset: z.enum(["last7", "last30", "last90"]).default("last30"),
});

export async function analyticsRoutes(app: FastifyInstance) {
  // Guard: super_admin only
  app.addHook("onRequest", async (req) => {
    if (req.auth?.role !== "super_admin") {
      throw new ForbiddenError("Only super_admin can access analytics");
    }
  });

  // GET /dashboard?preset=last7|last30|last90
  app.get("/dashboard", async (req, reply) => {
    const { preset } = DashboardQuery.parse(req.query);
    const data = await service.getDashboard(preset);
    return reply.send(data);
  });
}
