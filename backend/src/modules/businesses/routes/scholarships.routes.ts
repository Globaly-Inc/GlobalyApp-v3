import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { CreateScholarshipSchema, PatchScholarshipSchema } from "../../superadmin/data-extraction/schemas/staged.schema.js";
import * as extracted from "../repositories/institution-scholarships.repository.js";
import { servicesSourceJobId } from "./services.routes.js";
import { resolveSharedCourses } from "../../superadmin/platform/business-branches/repositories/business-branches.repository.js";
import {
  BusinessScholarshipInputSchema, BusinessScholarshipListQuery, ExtractedScholarshipListQuery,
} from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import * as service from "../../superadmin/monitoring/scholarships/services/scholarships.service.js";
import * as activityService from "../services/activity.service.js";

const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const UuidParamSchema = z.object({ id: z.string().uuid() });
// course_ids: the courses this scholarship is for; [] = every course. Omitted on update = unchanged.
const CourseIdsSchema = z.object({ course_ids: z.array(z.string().uuid()).optional() });
const ExtractedInputSchema = CreateScholarshipSchema.omit({ job_id: true }).merge(CourseIdsSchema);
const ExtractedPatchSchema = PatchScholarshipSchema.merge(CourseIdsSchema);

/** Rejects a course this org can't see (another institution's, or one not shared with this branch).
 * Runs BEFORE the write, so a bad pick never leaves a half-saved scholarship. */
async function checkedCourseIds(req: { auth: { orgType?: string }; institutionId: number }, jobId: string, courseIds?: string[]) {
  if (courseIds === undefined) return undefined;
  const ids = [...new Set(courseIds)];
  const sharedCourses = req.auth.orgType === "institution" ? await resolveSharedCourses(req.institutionId) : null;
  if ((await extracted.visibleCourseIds(jobId, sharedCourses, ids)).length !== ids.length) {
    throw new BadRequestError("One or more selected courses aren't available to this institution.");
  }
  return ids;
}

/** The job an institution's scholarships live on — the same job its Services tab reads courses from. */
async function catalogJob(req: Parameters<typeof servicesSourceJobId>[0]) {
  const jobId = await servicesSourceJobId(req);
  if (!jobId) throw new BadRequestError("This listing has no institution catalog to hold scholarships.");
  return jobId;
}

/** The job's unique (job_id, lower(trim(name))) index — a clear message, not a raw 500. */
async function uniqueName<T>(write: Promise<T>) {
  try { return await write; } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ConflictError("A scholarship with this name already exists.");
    throw e;
  }
}

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

  // ── An institution's own scholarships: its extraction job's rows (see catalogJob) ──

  app.get("/extracted-scholarships", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, applicable_to, coverage_type, origin, ...pagination } = ExtractedScholarshipListQuery.parse(req.query);
    const filters = { search, applicable_to, coverage_type, origin };
    const { limit, offset } = paginationToOffset(pagination);
    const jobId = await servicesSourceJobId(req);
    // A branch also sees its head office's scholarships for the courses shared with it — read-only
    // (writes below are scoped to its own job, so a shared row can never be edited from here).
    const sharedCourses = req.auth.orgType === "institution" ? await resolveSharedCourses(req.institutionId) : null;
    const [own, shared] = await Promise.all([
      jobId ? extracted.list(jobId, limit, offset, filters) : { rows: [], total: 0 },
      extracted.listShared(sharedCourses, filters),
    ]);
    // Own rows first, then shared ones, paged as one list.
    const sharedFrom = Math.max(0, offset - own.total);
    const rows = await extracted.withCourses([...own.rows, ...shared.slice(sharedFrom, sharedFrom + limit - own.rows.length)], jobId, sharedCourses);
    return reply.send(buildPaginatedResponse(rows, own.total + shared.length, pagination));
  });

  app.post("/extracted-scholarships", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { course_ids, ...data } = ExtractedInputSchema.parse(req.body);
    const jobId = await catalogJob(req);
    const courseIds = await checkedCourseIds(req, jobId, course_ids);
    const row = await uniqueName(extracted.insert(jobId, data, Number(req.auth.sub)));
    if (courseIds) await extracted.setCourses(jobId, row.id, courseIds);
    return reply.status(201).send(row);
  });

  app.patch("/extracted-scholarships/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { course_ids, ...data } = ExtractedPatchSchema.parse(req.body);
    const jobId = await catalogJob(req);
    const courseIds = await checkedCourseIds(req, jobId, course_ids);
    // update() is job-scoped, so a head office's shared scholarship 404s here before any relink.
    if (!(await uniqueName(extracted.update(jobId, id, data, Number(req.auth.sub))))) throw new NotFoundError("Scholarship not found");
    if (courseIds) await extracted.setCourses(jobId, id, courseIds);
    return reply.status(204).send();
  });

  app.delete("/extracted-scholarships/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    if (!(await extracted.remove(await catalogJob(req), id))) throw new NotFoundError("Scholarship not found");
    return reply.status(204).send();
  });
}
