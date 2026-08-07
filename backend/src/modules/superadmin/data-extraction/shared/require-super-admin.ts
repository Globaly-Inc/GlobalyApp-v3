// Auth guard — rejects any request where req.auth.role is not super_admin or data_admin.
// Registered as an onRequest hook at the module level.

import type { FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { ALLOWED_ROLES } from "../../consts.js";

export async function requireSuperAdmin(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.auth?.role || !(ALLOWED_ROLES as readonly string[]).includes(req.auth.role)) {
    throw new ForbiddenError("Only super_admin or data_admin can access extraction endpoints");
  }
}
