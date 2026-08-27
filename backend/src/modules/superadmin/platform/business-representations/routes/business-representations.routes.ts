// Superadmin routes for a single business's partner representations (surfaced in the Partners tab).

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import {
  IdParamSchema, RelationInputSchema, RelationListQuerySchema, RelationPatchSchema, SubIdParamSchema,
} from "../schemas/business-representations.schema.js";
import * as service from "../services/business-representations.service.js";

export async function businessRepresentationsRoutes(app: FastifyInstance) {
  app.get("/businesses/:id/relations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = RelationListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listRelations(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/businesses/:id/relations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = RelationInputSchema.parse(req.body);
    const relation = await service.createRelation(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_RELATION_ADDED", "business", undefined, {
      business_id: id, partner_business_id: data.partner_business_id,
    });
    return reply.status(201).send(relation);
  });

  app.patch("/businesses/:id/relations/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = RelationPatchSchema.parse(req.body);
    const relation = await service.updateRelation(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_RELATION_UPDATED", "business", undefined, { business_id: id, relation_id: subId });
    return reply.send(relation);
  });

  app.delete("/businesses/:id/relations/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteRelation(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_RELATION_REMOVED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });
}
