import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  ServiceFieldValuesInputSchema, ServiceInputSchema, ServicePatchInputSchema, ServiceSearchQuerySchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";
import * as coursesRepo from "../../superadmin/data-extraction/repositories/courses.repository.js";
import type { CourseListFilters } from "../../superadmin/data-extraction/repositories/courses.repository.js";
import * as activityService from "../services/activity.service.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });

/**
 * An institution has no `business_services` table — its closest equivalent is the extracted
 * course catalog filed under its `source_job_id` (same data the superadmin institution detail
 * page's Services tab reads). Shaped to look like a BusinessService row so the existing
 * self-service Services tab can render it read-only, same table as businesses.
 */
function courseToBusinessService(c: {
  id: string; name: string; description: string | null; subject_area: string | null;
  degree_level: string | null; duration_weeks: number | null; domestic_fee_total: string | number | null;
  domestic_currency: string | null; created_at: Date;
}) {
  return {
    id: c.id,
    service_category_id: null,
    category_name: c.subject_area,
    name: c.name,
    description: c.description,
    price: c.domestic_fee_total != null ? `${c.domestic_currency ?? ""} ${c.domestic_fee_total}`.trim() : null,
    is_published: true,
    public_visibility: null,
    created_at: c.created_at,
    degree_level: c.degree_level,
    area_of_study: c.subject_area,
    duration: c.duration_weeks != null ? `${c.duration_weeks} weeks` : null,
  };
}

async function searchInstitutionCourses(sourceJobId: string | null, limit: number, offset: number, filters: CourseListFilters) {
  if (!sourceJobId) return { rows: [], total: 0 };
  const [rows, total] = await Promise.all([
    coursesRepo.listCoursesByJob(sourceJobId, limit, offset, filters),
    coursesRepo.countCoursesByJob(sourceJobId, filters),
  ]);
  return { rows: rows.map(courseToBusinessService), total };
}

export async function businessServicesRoutes(app: FastifyInstance) {
  app.get("/services", { preHandler: requireBusinessContext }, async (req, reply) => {
    return reply.send(await service.listServices(Number(req.business!.id)));
  });

  app.get("/services/search", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = req.auth.orgType === "institution"
      ? await searchInstitutionCourses(req.institution!.source_job_id, limit, offset, { search })
      : await service.searchServices(Number(req.business!.id), limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/services", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createService(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_CREATED", "service", created.id, { name: created.name });
    return reply.status(201).send(created);
  });

  app.patch("/services/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateService(Number(req.business!.id), subId, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_UPDATED", "service", subId);
    return reply.send(updated);
  });

  app.delete("/services/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteService(Number(req.business!.id), subId);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_DELETED", "service", subId);
    return reply.status(204).send();
  });

  app.get("/services/:subId/field-values", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    return reply.send(await service.getServiceFieldValues(Number(req.business!.id), subId));
  });

  app.put("/services/:subId/field-values", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertServiceFieldValues(Number(req.business!.id), subId, values);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_FIELDS_UPDATED", "service", subId);
    return reply.send(updated);
  });
}
