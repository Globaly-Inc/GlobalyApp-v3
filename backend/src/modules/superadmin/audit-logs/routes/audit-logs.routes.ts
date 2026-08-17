// Audit-log viewer routes. Parent registers under /api/v3/admin/audit-logs behind requireAdmin.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { ALLOWED_ROLES } from "../../consts.js";
import { AuditLogParamsSchema, AuditLogQuerySchema } from "../schemas/audit-logs.schema.js";
import * as service from "../services/audit-logs.service.js";

/**
 * Audit logs name who did what, so they sit at the same elevated bar as the extraction
 * endpoints (super_admin | data_admin) rather than the plain requireAdmin bar.
 */
async function requireElevatedAdmin(req: FastifyRequest) {
  if (!(ALLOWED_ROLES as readonly string[]).includes(req.auth?.role ?? "")) {
    throw new ForbiddenError("Only super_admin or data_admin can view audit logs");
  }
}

export async function auditLogsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireElevatedAdmin);

  app.get("/", async (req, reply) => {
    const query = AuditLogQuerySchema.parse(req.query);
    return reply.send(await service.listAuditLogs(query));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = AuditLogParamsSchema.parse(req.params);
    return reply.send(await service.getAuditLog(id));
  });
}
