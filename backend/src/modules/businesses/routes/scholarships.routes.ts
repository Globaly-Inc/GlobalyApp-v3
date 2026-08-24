import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  BusinessScholarshipInputSchema, BusinessScholarshipListQuery,
} from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import * as service from "../../superadmin/monitoring/scholarships/services/scholarships.service.js";
import * as activityService from "../services/activity.service.js";

const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function businessScholarshipsRoutes(app: FastifyInstance) {
  app.get("/scholarships", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { search, ...pagination } = BusinessScholarshipListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const businessId = Number(req.business!.id);
    const [rows, total] = await Promise.all([
      service.listForBusiness(businessId, limit, offset, { search }),
      service.countForBusiness(businessId, { search }),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/scholarships", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = BusinessScholarshipInputSchema.parse(req.body);
    const businessId = Number(req.business!.id);
    const scholarship = await service.createForBusiness(businessId, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SCHOLARSHIP_CREATED", "scholarship", scholarship.id, { title: scholarship.title });
    return reply.status(201).send(scholarship);
  });

  app.patch("/scholarships/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = BusinessScholarshipInputSchema.partial().parse(req.body);
    const businessId = Number(req.business!.id);
    const scholarship = await service.updateForBusiness(businessId, id, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SCHOLARSHIP_UPDATED", "scholarship", String(id));
    return reply.send(scholarship);
  });

  app.delete("/scholarships/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const businessId = Number(req.business!.id);
    await service.removeForBusiness(businessId, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SCHOLARSHIP_DELETED", "scholarship", String(id));
    return reply.status(204).send();
  });
}
