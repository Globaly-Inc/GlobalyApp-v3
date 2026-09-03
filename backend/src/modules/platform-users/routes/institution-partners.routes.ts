// Self-service institution partners routes — institution context required.
// The institution twin of businesses' GET/POST/PATCH/DELETE /businesses/partners: mirror
// direction of the same business_representations table (this institution is the target,
// not the originator) — see business-representations.repository.ts.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  RelationInputSchema, RelationListQuerySchema, RelationPatchSchema,
} from "../../superadmin/platform/business-representations/schemas/business-representations.schema.js";
import * as service from "../../superadmin/platform/business-representations/services/business-representations.service.js";

const PartnerIdParamSchema = z.object({ partnerId: z.string().uuid() });

export async function institutionPartnersRoutes(app: FastifyInstance) {
  app.get("/partners", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { search, ...pagination } = RelationListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionRelations(req.institutionId, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Same request shape as businesses' own POST /businesses/partners (partner_business_id,
  // apply_to_branches) — institutions have no branches, so apply_to_branches is just unused here.
  app.post("/partners", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { partner_business_id, country_ids, valid_from, valid_until, notes } = RelationInputSchema.parse(req.body);
    const relation = await service.createInstitutionRelation(req.institutionId, partner_business_id, { country_ids, valid_from, valid_until, notes });
    return reply.status(201).send(relation);
  });

  app.patch("/partners/:partnerId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { partnerId } = PartnerIdParamSchema.parse(req.params);
    const data = RelationPatchSchema.parse(req.body);
    const relation = await service.updateInstitutionRelation(req.institutionId, partnerId, data);
    return reply.send(relation);
  });

  app.delete("/partners/:partnerId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { partnerId } = PartnerIdParamSchema.parse(req.params);
    await service.deleteInstitutionRelation(req.institutionId, partnerId);
    return reply.status(204).send();
  });
}
