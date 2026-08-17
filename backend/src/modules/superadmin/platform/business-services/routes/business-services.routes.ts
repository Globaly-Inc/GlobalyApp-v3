// Superadmin oversight of a single business's service catalog.
//
// Same service layer as the tenant routes under /api/v3/businesses/services; the
// only difference is where the tenant Knex comes from. Tenant routes get req.db
// from the tenant plugin, admins resolve it from the :id in the path — which is
// also the only reason an admin can cross a schema boundary at all.
//
// The parent module already gates this on super_admin / data_admin.

import type { FastifyInstance } from "fastify";
import * as platformRepo from "../../platform.repository.js";
import {
  CreateServiceSchema,
  IdParamSchema,
  ServiceFieldValuesInputSchema,
  ServiceSearchQuerySchema,
  SubIdParamSchema,
  UpdateServiceSchema,
} from "../schemas/business-services.schema.js";
import * as service from "../services/business-services.service.js";

export async function businessServicesRoutes(app: FastifyInstance) {
  app.get("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listAllServices(await service.businessDb(id)));
  });

  app.get("/businesses/:id/services/search", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const db = await service.businessDb(id);
    return reply.send(await service.listServices(db, search ? { search } : {}, pagination));
  });

  app.get("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getService(await service.businessDb(id), subId));
  });

  app.post("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = CreateServiceSchema.parse(req.body);
    const created = await service.createService(await service.businessDb(id), data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_CREATED", "business", undefined, {
      business_id: id,
    });
    return reply.status(201).send(created);
  });

  app.patch("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = UpdateServiceSchema.parse(req.body);
    const updated = await service.updateService(await service.businessDb(id), subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_UPDATED", "business", undefined, {
      business_id: id,
    });
    return reply.send(updated);
  });

  app.delete("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteService(await service.businessDb(id), subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_DELETED", "business", undefined, {
      business_id: id,
    });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getServiceFieldValues(await service.businessDb(id), subId));
  });

  app.put("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertServiceFieldValues(await service.businessDb(id), subId, values);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FIELDS_UPDATED", "business", undefined, {
      business_id: id,
    });
    return reply.send(updated);
  });
}
