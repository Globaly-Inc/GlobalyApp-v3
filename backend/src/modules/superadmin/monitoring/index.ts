// Monitoring module — admin oversight views with no business ownership of their own
// (scholarships today; a sibling of platform/, marketing/, etc.).
// All routes require super_admin or data_admin, matching platform/index.ts's gate.

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import { ALLOWED_ROLES } from "../consts.js";
import scholarshipsModule from "./scholarships/index.js";

export default async function monitoringModule(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    if (!req.auth?.role || !(ALLOWED_ROLES as readonly string[]).includes(req.auth.role)) {
      throw new ForbiddenError("Only super_admin or data_admin can access monitoring");
    }
  });

  app.register(scholarshipsModule, { prefix: "/scholarships" });
}
