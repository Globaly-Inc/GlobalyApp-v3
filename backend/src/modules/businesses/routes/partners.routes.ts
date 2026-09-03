import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  RelationInputSchema, RelationListQuerySchema, RelationPatchSchema,
} from "../../superadmin/platform/business-representations/schemas/business-representations.schema.js";
import * as service from "../../superadmin/platform/business-representations/services/business-representations.service.js";
import * as institutionsService from "../../superadmin/platform/businesses/services/businesses.service.js";
import * as activityService from "../services/activity.service.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });
const InstitutionIdSchema = z.object({ institutionId: z.coerce.number().int().positive() });

export async function businessPartnersRoutes(app: FastifyInstance) {
  app.get("/partners", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = RelationListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listRelations(Number(req.business!.id), limit, offset);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/partners", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = RelationInputSchema.parse(req.body);
    const relation = await service.createRelation(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "PARTNER_ADDED", "partner", relation.id, { partner_business_id: data.partner_business_id });
    return reply.status(201).send(relation);
  });

  app.patch("/partners/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = RelationPatchSchema.parse(req.body);
    const relation = await service.updateRelation(Number(req.business!.id), subId, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "PARTNER_UPDATED", "partner", subId);
    return reply.send(relation);
  });

  app.delete("/partners/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteRelation(Number(req.business!.id), subId);
    await activityService.logActivity(req.db, Number(req.auth.sub), "PARTNER_REMOVED", "partner", subId);
    return reply.status(204).send();
  });

  app.get("/partners/institutions/:institutionId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { institutionId } = InstitutionIdSchema.parse(req.params);
    const detail = await institutionsService.getPartnerInstitutionDetail(Number(req.business!.id), institutionId);
    return reply.send(detail);
  });

  app.get("/partners/institutions/:institutionId/courses", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { institutionId } = InstitutionIdSchema.parse(req.params);
    const { search, ...pagination } = RelationListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await institutionsService.listPartnerInstitutionCourses(Number(req.business!.id), institutionId, { search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
