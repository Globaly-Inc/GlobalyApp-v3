// Auth guard — rejects any request where req.auth.role is not super_admin or data_admin.
// Registered as an onRequest hook at the module level.

import type { FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";

const ALLOWED_ROLES = ["super_admin", "data_admin"];

export async function requireSuperAdmin(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.auth?.role || !ALLOWED_ROLES.includes(req.auth.role)) {
    throw new ForbiddenError("Only super_admin or data_admin can access extraction endpoints");
  }
}
