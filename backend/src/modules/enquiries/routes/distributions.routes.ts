// Distribution routes — the business inbox: list, unlock, close, and chat. Business
// scoping follows the existing convention (requireBusinessContext resolves
// req.auth.orgId and sets req.db to the tenant-scoped Knex via tenant.plugin.ts,
// requirePermission gates the action) rather than a :businessId URL param.

import type { FastifyInstance } from "fastify";
import * as service from "../services/distributions.service.js";
import * as messagesService from "../services/messages.service.js";
import {
  CloseDistributionSchema,
  DistributionIdParamSchema,
  ListDistributionsQuerySchema,
  SendEnquiryMessageSchema,
} from "../schemas/distributions.schema.js";
import { requireBusinessContext, requirePermission } from "../../../core/plugins/auth.plugin.js";

export async function distributionsRoutes(app: FastifyInstance) {
  app.get(
    "/enquiry-distributions",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:view")] },
    async (req, reply) => {
      const query = ListDistributionsQuerySchema.parse(req.query);
      const distributions = await service.listForBusiness(req.db, query);
      return reply.send({ data: distributions });
    },
  );

  // Credit balance for the unlock paywall. Read-only, so it rides on
  // enquiries:view rather than needing its own permission.
  app.get(
    "/enquiry-distributions/credits",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:view")] },
    async (req, reply) => reply.send(service.getCreditBalance()),
  );

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached —
  // both mapped from the thrown AppError by error-handler.plugin.ts.
  app.post(
    "/enquiry-distributions/:id/unlock",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:unlock")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const result = await service.unlock(req.businessId, id, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  app.post(
    "/enquiry-distributions/:id/close",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:respond")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const { close_reason } = CloseDistributionSchema.parse(req.body);
      const result = await service.close(req.businessId, id, close_reason, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  // ── Chat ──
  // Reuses enquiries:respond, the same permission as close: both are "act on a lead
  // that was distributed to us". 409 until the row is unlocked, and once closed.

  app.get(
    "/enquiry-distributions/:id/messages",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:respond")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const messages = await messagesService.listForBusiness(id, req.businessId, Number(req.auth.sub));
      return reply.send({ messages });
    },
  );

  app.post(
    "/enquiry-distributions/:id/messages",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:respond")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const { body } = SendEnquiryMessageSchema.parse(req.body);
      const message = await messagesService.sendAsBusiness(id, req.businessId, Number(req.auth.sub), body);
      return reply.send(message);
    },
  );
}
