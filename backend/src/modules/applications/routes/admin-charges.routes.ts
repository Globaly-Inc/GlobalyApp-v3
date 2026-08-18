// Admin application-charge oversight, behind requireAdmin.
// Backs admin/revenue/subscriptions/application-charges. Spec: V1's
// AdminApplicationCharges.tsx (list, status + charged_at range filter, waive, refund).
//
// /stats is registered before /:id/* so a literal path is never captured by the id
// parameter.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import { AdminChargesQuery, IdParamSchema } from "../schemas/applications.schema.js";
import * as charges from "../services/charges.service.js";

export async function adminChargesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.get("/stats", async (_req, reply) => reply.send(await charges.stats()));

  app.get("/", async (req, reply) => {
    const query = AdminChargesQuery.parse(req.query);
    return reply.send(await charges.listAdminCharges(query));
  });

  // Both verbs return the credits, exactly once. V1's waive did NOT return them,
  // which made "waived" mean two different things depending on the button pressed.
  app.post("/:id/waive", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await charges.waive(id, Number(req.auth.sub)));
  });

  app.post("/:id/refund", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await charges.refund(id, Number(req.auth.sub)));
  });
}
