// Revenue module — credit ledger now; referral governance and manual adjustments in Phase 3.
//
// Mirrors superadmin/platform: registered inside the requireAdmin scope in superadmin/index.ts, with an
// additional role check here so the guard lives beside the routes it protects.

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import { ALLOWED_ROLES } from "../consts.js";
import { adminCreditRoutes } from "./routes/credits.routes.js";

export default async function revenueModule(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    if (!req.auth?.role || !(ALLOWED_ROLES as readonly string[]).includes(req.auth.role)) {
      throw new ForbiddenError("Only super_admin or data_admin can access revenue data");
    }
  });

  app.register(adminCreditRoutes);
}
