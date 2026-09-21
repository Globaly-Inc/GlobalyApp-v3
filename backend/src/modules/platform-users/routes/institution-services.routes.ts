// Self-service institution services routes — institution context required.
// The institution twin of businesses' GET/POST/PATCH/DELETE /businesses/services — same
// business_services tenant table (see the institution migration's comment).

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  ServiceFieldValuesInputSchema, ServiceInputSchema, ServicePatchInputSchema, ServiceSearchQuerySchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";
import * as storage from "../../../shared/storage/storageService.js";
import { NotFoundError } from "../../../shared/errors.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });

export async function institutionServicesRoutes(app: FastifyInstance) {
  app.get("/services", { preHandler: requireInstitutionContext }, async (req, reply) => {
    return reply.send(await service.listInstitutionServices(req.institutionId));
  });

  app.get("/services/search", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.searchInstitutionServices(req.institutionId, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/services", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createInstitutionService(req.institutionId, data);
    return reply.status(201).send(created);
  });

  app.patch("/services/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionService(req.institutionId, subId, data);
    return reply.send(updated);
  });

  app.delete("/services/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteInstitutionService(req.institutionId, subId);
    return reply.status(204).send();
  });

  // Institution twin of the business cover endpoints — with none set the client falls back to
  // the institution's own cover image.
  app.post("/services/:subId/cover", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    // Before the upload, not after: an unknown UUID would otherwise leave an orphaned object.
    await service.requireInstitutionService(req.institutionId, subId);
    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");
    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);
    const storagePath = storage.buildPath("public/institutions", req.auth.orgId!, `services/${subId}`, file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);
    return reply.send(await service.setInstitutionServiceCover(req.institutionId, subId, storagePath));
  });

  app.delete("/services/:subId/cover", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.setInstitutionServiceCover(req.institutionId, subId, null);
    return reply.status(204).send();
  });

  app.get("/services/:subId/field-values", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    return reply.send(await service.getInstitutionServiceFieldValues(req.institutionId, subId));
  });

  app.put("/services/:subId/field-values", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertInstitutionServiceFieldValues(req.institutionId, subId, values);
    return reply.send(updated);
  });
}
