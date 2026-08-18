// Business-facing enquiry inbox + unlock. Registered under
// /api/v3/business/enquiries behind requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — and never from the path or body. That is the whole cross-tenant
// isolation story: every repository call is filtered by it, so business B's
// distribution is a 404 for business A, not a 403 (which would confirm it exists).

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  DistributionIdParamSchema,
  ListInboxQuerySchema,
} from "../schemas/enquiries.schema.js";
import * as service from "../services/enquiries.service.js";

/**
 * BusinessRecord.id is declared string in core/types.ts but the column is a
 * serial — Number() is the narrowing, not a cast that could lie. Same precedent
 * as billing/routes/context.ts.
 */
function businessId(req: { business?: { id: string | number } }): number {
  return Number(req.business!.id);
}

export async function businessEnquiriesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const query = ListInboxQuerySchema.parse(req.query);
    return reply.send(await service.listInbox(businessId(req), query));
  });

  app.get("/:distributionId", async (req, reply) => {
    const { distributionId } = DistributionIdParamSchema.parse(req.params);
    return reply.send(await service.getInboxItem(businessId(req), distributionId));
  });

  // Spends credits. 402 when the wallet cannot cover the lead's coin_cost, and
  // nothing is written in that case — see unlockEnquiry for why.
  app.post("/:distributionId/unlock", async (req, reply) => {
    const { distributionId } = DistributionIdParamSchema.parse(req.params);
    return reply.send(
      await service.unlockEnquiry(businessId(req), distributionId, Number(req.auth.sub)),
    );
  });
}
