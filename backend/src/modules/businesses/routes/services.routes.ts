import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  ServiceAiAssistSchema, ServiceFieldValuesInputSchema, ServiceInputSchema, ServicePatchInputSchema, ServiceSearchQuerySchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";
import * as coursesRepo from "../../superadmin/data-extraction/repositories/courses.repository.js";
import { isInstitutionCategory } from "../../superadmin/data-extraction/repositories/promote.repository.js";
import { ForbiddenError } from "../../../shared/errors.js";
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
  domestic_currency: string | null; created_at: Date; course_category: string | null;
  service_category_id: number | null;
}) {
  return {
    id: c.id,
    // Was hardcoded null — extraction_courses has had a real service_category_id column since
    // migration 20260921_004, which is what the Add/Edit Service form's category combobox reads
    // to preselect the saved category; leaving it null here is why a saved course reopened with
    // no category selected.
    service_category_id: c.service_category_id,
    category_name: c.course_category === "short_course" ? "Short Course" : "Academic Course",
    name: c.name,
    description: c.description,
    price: c.domestic_fee_total != null ? `${c.domestic_currency ?? ""} ${c.domestic_fee_total}`.trim() : null,
    is_published: true,
    public_visibility: null,
    created_at: c.created_at,
    degree_level: c.degree_level,
    area_of_study: c.subject_area,
    duration: c.duration_weeks != null ? `${c.duration_weeks} weeks` : null,
    course_category: c.course_category === "short_course" ? "short_course" : "academic",
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

/**
 * The source_job_id a listing's services must be read from, or null to use business_services.
 *
 * An institution reads its catalog through the job whatever its claim state — the extracted
 * courses are never copied into a tenant schema. That holds for an institution in the
 * `institutions` table AND for one filed in `businesses` under the institutions category,
 * which is where an admin-created (manual) institution lives.
 *
 * Null when an institution-category listing has no job at all: one created before manual
 * institutions started minting theirs still owns whatever business_services rows it has, and
 * showing an empty catalog instead would be a regression, not a collapse.
 */
async function servicesSourceJobId(req: {
  auth: { orgType?: string };
  institution?: { source_job_id: string | null } | null;
  business?: { source_job_id?: string | null; business_category_id?: number | null } | null;
}): Promise<string | null> {
  if (req.auth.orgType === "institution") return req.institution?.source_job_id ?? null;
  const business = req.business;
  if (!business?.source_job_id || !business.business_category_id) return null;
  return (await isInstitutionCategory(Number(business.business_category_id)))
    ? business.source_job_id
    : null;
}

/**
 * A listing whose services ARE its extracted courses must not also accumulate
 * business_services rows: nothing reads them back, so the row would save and then vanish
 * from the Services tab. A true institution instead writes through the institution-scoped
 * functions below, which target extraction_courses directly (same as the admin institution
 * Add Service form) — this only refuses the ambiguous "business row categorised as an
 * institution" case, which has no such institution-scoped write path of its own.
 */
async function refuseIfCatalogIsExtracted(req: Parameters<typeof servicesSourceJobId>[0]) {
  if (req.auth.orgType !== "institution" && (await servicesSourceJobId(req))) {
    throw new ForbiddenError(
      "This institution's services are its course catalog — edit the courses, not business services.",
    );
  }
}

export async function businessServicesRoutes(app: FastifyInstance) {
  app.get("/services", { preHandler: requireBusinessContext }, async (req, reply) => {
    return reply.send(await service.listServices(Number(req.business!.id)));
  });

  app.get("/services/search", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, course_category, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const sourceJobId = await servicesSourceJobId(req);
    const { rows, total } = sourceJobId
      ? await searchInstitutionCourses(sourceJobId, limit, offset, { search, courseCategory: course_category })
      : await service.searchServices(Number(req.business!.id), limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/services/ai-assist", {
    preHandler: requireBusinessOrInstitutionContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = ServiceAiAssistSchema.parse(req.body);
    const result = await service.generateServiceDescription(input);
    return reply.send(result);
  });

  // A true institution's "service" is a manually-added row in its extracted course catalog
  // (extraction_courses), not a business_services row — same split as the admin
  // /institutions/:id/services routes this reuses, just scoped by auth context instead of a
  // URL id. See servicesSourceJobId's header comment for why this can't just key off
  // `req.auth.orgType` alone for every caller (a business-category-institution row has no
  // `req.institution` at all), but for these mutating routes there's no such row to worry
  // about — only a real institution context has one.
  app.post("/services", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const data = ServiceInputSchema.parse(req.body);
    if (req.auth.orgType === "institution") {
      const created = await service.createInstitutionService(Number(req.institution!.id), data, Number(req.auth.sub));
      return reply.status(201).send(created);
    }
    await refuseIfCatalogIsExtracted(req);
    const created = await service.createService(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_CREATED", "service", created.id, { name: created.name });
    return reply.status(201).send(created);
  });

  app.patch("/services/:subId", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    if (req.auth.orgType === "institution") {
      const updated = await service.updateInstitutionService(Number(req.institution!.id), subId, data, Number(req.auth.sub));
      return reply.send(updated);
    }
    await refuseIfCatalogIsExtracted(req);
    const updated = await service.updateService(Number(req.business!.id), subId, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_UPDATED", "service", subId);
    return reply.send(updated);
  });

  app.delete("/services/:subId", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    if (req.auth.orgType === "institution") {
      await service.deleteInstitutionService(Number(req.institution!.id), subId);
      return reply.status(204).send();
    }
    await refuseIfCatalogIsExtracted(req);
    await service.deleteService(Number(req.business!.id), subId);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_DELETED", "service", subId);
    return reply.status(204).send();
  });

  app.get("/services/:subId/field-values", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    if (req.auth.orgType === "institution") {
      return reply.send(await service.getInstitutionServiceFieldValues(Number(req.institution!.id), subId));
    }
    return reply.send(await service.getServiceFieldValues(Number(req.business!.id), subId));
  });

  app.put("/services/:subId/field-values", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    if (req.auth.orgType === "institution") {
      const updated = await service.upsertInstitutionServiceFieldValues(Number(req.institution!.id), subId, values);
      return reply.send(updated);
    }
    const updated = await service.upsertServiceFieldValues(Number(req.business!.id), subId, values);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_FIELDS_UPDATED", "service", subId);
    return reply.send(updated);
  });
}
