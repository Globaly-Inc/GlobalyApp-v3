// The business's application inbox and its decisions, behind requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// verified JWT's orgId — and never from the path or body. Accepting is the only
// route in this module that spends money; see charges.service.ts for why the debit
// is the last write in the transaction.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  BusinessApplicationsQuery,
  BusinessChargesQuery,
  IdParamSchema,
  RejectApplicationSchema,
} from "../schemas/applications.schema.js";
import * as service from "../services/applications.service.js";
import * as charges from "../services/charges.service.js";

/**
 * BusinessRecord.id is declared string in core/types.ts but the column is a serial
 * — Number() is the narrowing, not a cast that could lie. Same precedent as
 * billing/routes/context.ts.
 */
function businessId(req: { business?: { id: string | number } }): number {
  return Number(req.business!.id);
}

export async function businessApplicationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const query = BusinessApplicationsQuery.parse(req.query);
    return reply.send(await service.listForBusiness(businessId(req), query));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.getForBusiness(businessId(req), id));
  });

  // Spends credits. 402 when the wallet cannot cover the charge, and NOTHING is
  // written in that case — not even the acceptance. See service.accept.
  app.post("/:id/accept", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.accept(businessId(req), id, Number(req.auth.sub)));
  });

  app.post("/:id/reject", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { note } = RejectApplicationSchema.parse(req.body ?? {});
    return reply.send(await service.reject(businessId(req), id, Number(req.auth.sub), note));
  });
}

/** V2's /me/business/:businessId/application-charges, with the id server-derived. */
export async function businessChargesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const query = BusinessChargesQuery.parse(req.query);
    // req.db is the caller's TENANT connection — business_services lives in the
    // tenant schema, so the service name cannot be joined from master.
    return reply.send(await charges.listOwnerCharges(businessId(req), req.db, query));
  });
}
