// Superadmin routes for a single business's services.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import {
  IdParamSchema, ServiceAiAssistSchema, ServiceFieldValuesInputSchema, ServiceInputSchema, ServicePatchInputSchema,
  ServiceSearchQuerySchema, SubIdParamSchema,
} from "../schemas/business-services.schema.js";
import * as service from "../services/business-services.service.js";

export async function businessServicesRoutes(app: FastifyInstance) {
  // Org-agnostic: name/category is all the generator needs, so one route covers both the
  // business and institution admin Add Service forms.
  app.post("/services/ai-assist", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = ServiceAiAssistSchema.parse(req.body);
    const result = await service.generateServiceDescription(input);
    return reply.send(result);
  });

  app.get("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listServices(id));
  });

  app.get("/businesses/:id/services/search", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.searchServices(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createService(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateService(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  app.delete("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteService(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getServiceFieldValues(id, subId));
  });

  app.put("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertServiceFieldValues(id, subId, values);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FIELDS_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  // Institution twins — same business_services tenant table, only the owning-entity differs.

  app.get("/institutions/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServices(id));
  });

  app.get("/institutions/:id/services/search", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.searchInstitutionServices(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/institutions/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createInstitutionService(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/institutions/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionService(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });

  app.delete("/institutions/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteInstitutionService(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getInstitutionServiceFieldValues(id, subId));
  });

  app.put("/institutions/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertInstitutionServiceFieldValues(id, subId, values);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_FIELDS_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });
}
