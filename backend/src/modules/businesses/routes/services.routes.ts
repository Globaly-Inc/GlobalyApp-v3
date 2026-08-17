// Tenant service catalog — core CRUD, publish transitions, and the dynamic
// per-category field values. Mounted at /api/v3/businesses/services.
//
// Guard is requireBusinessContext on every route: req.db is then the caller's own
// tenant schema, which is what makes cross-tenant access a 404 rather than a leak.
//
// ponytail: requirePermission() is deliberately NOT used — the per-tenant
// permissions / role_permissions tables have no seeder yet, so any permission
// check would 403 everyone. Swap it in once the seeder lands (follow-up).

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  CreateServiceSchema,
  ServiceFieldValuesInputSchema,
  ServiceFiltersSchema,
  ServiceParamsSchema,
  UpdateServiceSchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";
import * as activityService from "../services/activity.service.js";
import { serviceChildrenRoutes } from "./service-children.routes.js";
import { serviceAssignmentRoutes } from "./service-assignments.routes.js";

export const guard = { preHandler: requireBusinessContext };

export async function businessServicesRoutes(app: FastifyInstance) {
  const prefix = "/services";

  app.get(prefix, guard, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const filters = ServiceFiltersSchema.parse(req.query);
    return reply.send(await service.listServices(req.db, filters, pagination));
  });

  // Alias kept for the business profile UI, which calls /services/search.
  // Same paginated envelope as GET /services; `search` is just another filter.
  app.get(`${prefix}/search`, guard, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const filters = ServiceFiltersSchema.parse(req.query);
    return reply.send(await service.listServices(req.db, filters, pagination));
  });

  app.post(prefix, guard, async (req, reply) => {
    const input = CreateServiceSchema.parse(req.body);
    const row = await service.createService(req.db, input);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_CREATED", "service", String(row.id), {
      name: row.name,
    });
    return reply.status(201).send(row);
  });

  app.get(`${prefix}/:id`, guard, async (req, reply) => {
    const { id } = ServiceParamsSchema.parse(req.params);
    return reply.send(await service.getService(req.db, id));
  });

  app.patch(`${prefix}/:id`, guard, async (req, reply) => {
    const { id } = ServiceParamsSchema.parse(req.params);
    const input = UpdateServiceSchema.parse(req.body);
    const row = await service.updateService(req.db, id, input);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_UPDATED", "service", id);
    return reply.send(row);
  });

  app.delete(`${prefix}/:id`, guard, async (req, reply) => {
    const { id } = ServiceParamsSchema.parse(req.params);
    const result = await service.deleteService(req.db, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_DELETED", "service", id);
    return reply.send(result);
  });

  for (const [segment, isPublished] of [["publish", true], ["unpublish", false]] as const) {
    app.post(`${prefix}/:id/${segment}`, guard, async (req, reply) => {
      const { id } = ServiceParamsSchema.parse(req.params);
      const row = await service.setPublished(req.db, id, isPublished);
      await activityService.logActivity(
        req.db,
        Number(req.auth.sub),
        isPublished ? "SERVICE_PUBLISHED" : "SERVICE_UNPUBLISHED",
        "service",
        id,
      );
      return reply.send(row);
    });
  }

  app.get(`${prefix}/:id/field-values`, guard, async (req, reply) => {
    const { id } = ServiceParamsSchema.parse(req.params);
    return reply.send(await service.getServiceFieldValues(req.db, id));
  });

  app.put(`${prefix}/:id/field-values`, guard, async (req, reply) => {
    const { id } = ServiceParamsSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertServiceFieldValues(req.db, id, values);
    await activityService.logActivity(req.db, Number(req.auth.sub), "SERVICE_FIELDS_UPDATED", "service", id);
    return reply.send(updated);
  });

  await app.register(serviceChildrenRoutes, { prefix });
  await app.register(serviceAssignmentRoutes, { prefix });
}
