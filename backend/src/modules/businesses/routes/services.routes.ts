import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  ServiceAiAssistSchema, ServiceFieldValuesInputSchema, ServiceInputSchema, ServicePatchInputSchema, ServiceSearchQuerySchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";
import * as coursesRepo from "../../superadmin/data-extraction/repositories/courses.repository.js";
import { approveServices, getFeePricesForCourses } from "../../superadmin/platform/business-services/repositories/institution-courses.repository.js";
import { findAdminByPlatformUserId } from "../../superadmin/admin-users/repositories/admin-users.repository.js";
import { BUSINESS_PORTAL_SOURCE_TYPES, isApprovedCourse } from "../../superadmin/consts.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { selfServiceJobIds } from "../../superadmin/data-extraction/repositories/jobs.repository.js";
import { isInstitutionCategory } from "../../superadmin/data-extraction/repositories/promote.repository.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type { CourseListFilters } from "../../superadmin/data-extraction/repositories/courses.repository.js";
import * as activityService from "../services/activity.service.js";
import { resolveSharedCourses } from "../../superadmin/platform/business-branches/repositories/business-branches.repository.js";

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
  service_category_id: number | null; public_visibility?: Record<string, boolean> | null;
  is_published?: boolean; verification_status?: string | null;
  created_by_platform_user_id?: number | null; updated_by_platform_user_id?: number | null; updated_at?: Date | null;
}, feePrice?: string, selfService = false, editors: Map<number, string> = new Map()) {
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
    // The real price is the Fees tab (extraction_course_fees) — domestic_fee_total is a legacy
    // column nothing writes to anymore, so it's only the fallback for a course with no fees yet.
    price: feePrice ?? (c.domestic_fee_total != null ? `${c.domestic_currency ?? ""} ${c.domestic_fee_total}`.trim() : null),
    // Was hardcoded true — same duplicate-mapper bug as public_visibility below: extraction_courses
    // has a real is_published column now (migration 20260925_003).
    is_published: c.is_published ?? false,
    // Public pages need BOTH approval (owner or admin) and is_published (search PUBLIC_COURSE) — the
    // portal shows this so "Published" never claims a course is live before it's approved.
    approval_status: approvalStatus(c.verification_status, selfService),
    // created_by is null only on rows the extraction pipeline wrote (migration 20260908_002), so it
    // tells an extracted course from one someone added by hand. updated_by = the last editor.
    origin: c.created_by_platform_user_id == null ? "extracted" : "manual",
    // Never-edited hand-added courses credit their creator; untouched extracted ones show nothing.
    edited_by: lastEditor(c) != null ? editors.get(lastEditor(c)!) ?? null : null,
    edited_at: lastEditor(c) != null ? c.updated_at ?? null : null,
    // Was hardcoded null — same bug as service_category_id above: extraction_courses has a real
    // public_visibility column (migration 20260925_002), left unread here meant the edit page's
    // toggles (which seed their initial state from whatever's already in the list) always looked
    // "all public" regardless of what was actually saved, until the direct getService fallback
    // ran — which never fires for a service already present in this list.
    public_visibility: c.public_visibility ?? {},
    created_at: c.created_at,
    degree_level: c.degree_level,
    area_of_study: c.subject_area,
    duration: c.duration_weeks != null ? `${c.duration_weeks} weeks` : null,
    course_category: c.course_category === "short_course" ? "short_course" : "academic",
  };
}

/** verification_status → what the owner sees. flagged/mismatch = an admin found a problem. */
/** selfService: the course is from a business-portal extraction (see SELF_SERVICE_SKIPS_APPROVAL). */
function approvalStatus(status: string | null | undefined, selfService: boolean): "approved" | "pending" | "needs_changes" {
  if (isApprovedCourse(status, selfService ? BUSINESS_PORTAL_SOURCE_TYPES[0] : null)) return "approved";
  return status === "flagged" || status === "mismatch" ? "needs_changes" : "pending";
}

async function canApproveCourses(req: {
  auth: { sub: string | number; orgType?: string };
  db?: ((table: string) => import("knex").Knex.QueryBuilder) | null;
  business?: { owner_id?: number | string | null } | null;
}) {
  if (await findAdminByPlatformUserId(Number(req.auth.sub))) return true;
  if (req.auth.orgType === "institution") {
    const member = await req.db?.("members").where({ platform_user_id: Number(req.auth.sub), account_status: 1 })
      .whereNull("deleted_at").first("is_owner");
    return !!member?.is_owner;
  }
  return req.business?.owner_id != null && Number(req.business.owner_id) === Number(req.auth.sub);
}

async function searchInstitutionCourses(sourceJobId: string | null, limit: number, offset: number, filters: CourseListFilters) {
  if (!sourceJobId) return { rows: [], total: 0 };
  const [rows, total] = await Promise.all([
    coursesRepo.listCoursesByJob(sourceJobId, limit, offset, filters, "newest"), // recently added first
    coursesRepo.countCoursesByJob(sourceJobId, filters),
  ]);
  const editorIds = [...new Set(rows.map(lastEditor).filter((id): id is number => id != null))];
  const [prices, selfService, editors] = await Promise.all([
    getFeePricesForCourses(sourceJobId, rows.map((r) => r.id)),
    // Rows can be a parent's shared courses, from another job — so per row, not per listing.
    selfServiceJobIds([...new Set(rows.map((r) => String(r.job_id)))]),
    editorNames(editorIds),
  ]);
  return {
    rows: rows.map((r) => courseToBusinessService(r, prices.get(r.id), selfService.has(String(r.job_id)), editors)),
    total,
  };
}

/** Who last touched a course row: its last editor, else whoever added it by hand. */
function lastEditor(c: { updated_by_platform_user_id?: number | null; created_by_platform_user_id?: number | null }) {
  const id = c.updated_by_platform_user_id ?? c.created_by_platform_user_id;
  return id == null ? null : Number(id);
}

/** platform_users id → display name (full name, else email) for the "Edited by" line. */
async function editorNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const users = await masterKnex("platform_users").whereIn("id", ids).select("id", "first_name", "last_name", "email");
  return new Map(users.map((u) => [Number(u.id), [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email]));
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
export async function servicesSourceJobId(req: {
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
    const { search, course_category, published: publishedParam, origin, degree_level, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const published = publishedParam === undefined ? undefined : publishedParam === "published";
    const { limit, offset } = paginationToOffset(pagination);
    const sourceJobId = await servicesSourceJobId(req);
    const shared = req.auth.orgType === "institution" ? await resolveSharedCourses(req.institutionId) : null;
    const { rows, total } = sourceJobId
      ? await searchInstitutionCourses(sourceJobId, limit, offset, {
        search, courseCategory: course_category, shared, published, origin, degreeLevel: degree_level,
      })
      : await service.searchServices(Number(req.business!.id), limit, offset, search, published);
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
      // byOwner: a portal-created course starts unapproved — the owner or an admin approves it.
      const created = await service.createInstitutionService(Number(req.institution!.id), data, Number(req.auth.sub), true);
      return reply.status(201).send(created);
    }
    await refuseIfCatalogIsExtracted(req);
    const created = await service.createService(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_CREATED", "service", created.id, { name: created.name });
    return reply.status(201).send(created);
  });

  // Single-service lookup — the edit page's fallback when the service isn't already in whatever
  // page of the list/search it happened to load (search.ts's default limit is 100; a catalog
  // bigger than that would otherwise show a blank editor for anything past the first page).
  app.get("/services/:subId", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const found = req.auth.orgType === "institution"
      ? await service.getInstitutionService(Number(req.institution!.id), subId)
      : await service.getService(Number(req.business!.id), subId);
    if (!found) throw new NotFoundError("Service not found");
    return reply.send(found);
  });

  // Approving makes a course eligible to publish (and live, once published). Only the org's
  // OWNER or a platform admin may approve — not every member who can edit courses.
  app.post("/services/approve", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
    if (!(await canApproveCourses(req))) throw new ForbiddenError("Only the owner or an admin can approve courses.");
    const jobId = await servicesSourceJobId(req);
    if (!jobId) throw new BadRequestError("This listing's services don't need approval.");
    const approved = await approveServices(jobId, ids, Number(req.auth.sub));
    return reply.send({ approved });
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
