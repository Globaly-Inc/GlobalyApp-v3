// Audit-logs sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { auditLogsRoutes } from "./routes/audit-logs.routes.js";

export default async function auditLogsModule(app: FastifyInstance) {
  app.register(auditLogsRoutes);
}
