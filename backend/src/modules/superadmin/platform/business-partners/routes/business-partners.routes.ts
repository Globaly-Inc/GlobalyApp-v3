// Superadmin routes for a single business's partners (agency/consultancy links).

import type { FastifyInstance } from "fastify";
import * as platformRepo from "../../platform.repository.js";
import { IdParamSchema, PartnerInputSchema, PartnerStatusInputSchema, SubIdParamSchema } from "../schemas/business-partners.schema.js";
import * as service from "../services/business-partners.service.js";

export async function businessPartnersRoutes(app: FastifyInstance) {
  app.get("/businesses/:id/partners", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listBusinessPartners(id));
  });

  app.post("/businesses/:id/partners", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { partner_business_id } = PartnerInputSchema.parse(req.body);
    const partner = await service.createBusinessPartner(id, partner_business_id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_PARTNER_ADDED", "business", undefined, { business_id: id, partner_business_id });
    return reply.status(201).send(partner);
  });

  app.patch("/businesses/:id/partners/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const { status } = PartnerStatusInputSchema.parse(req.body);
    const partner = await service.updateBusinessPartnerStatus(id, subId, status);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_PARTNER_STATUS_UPDATED", "business", undefined, { business_id: id, status });
    return reply.send(partner);
  });

  app.delete("/businesses/:id/partners/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteBusinessPartner(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_PARTNER_REMOVED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });
}
