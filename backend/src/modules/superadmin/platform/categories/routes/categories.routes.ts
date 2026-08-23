// Category management routes — business categories + service categories.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../../../shared/pagination.js";
import {
  CategoryInputSchema, DefaultServicesInputSchema, IdParamSchema,
  SchemaFieldEntityTypeSchema, SchemaFieldInputSchema, SchemaFieldOrderSchema, SchemaFieldUpdateSchema,
} from "../schemas/categories.schema.js";
import * as service from "../services/categories.service.js";

const SchemaFieldParentParams = z.object({
  entityType: SchemaFieldEntityTypeSchema,
  entityId: z.coerce.number().int().positive(),
});

const CategoryListQuery = PaginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
});

export async function categoryRoutes(app: FastifyInstance) {
  // ── Schema Fields (polymorphic: business_categories | service_categories) ──

  app.get("/:entityType/:entityId/schema-fields", async (req, reply) => {
    const { entityType, entityId } = SchemaFieldParentParams.parse(req.params);
    const rows = await service.listSchemaFields(entityType, entityId);
    return reply.send({ schema_fields: rows });
  });

  app.post("/:entityType/:entityId/schema-fields", async (req, reply) => {
    const { entityType, entityId } = SchemaFieldParentParams.parse(req.params);
    const data = SchemaFieldInputSchema.parse(req.body);
    const row = await service.createSchemaField(entityType, entityId, data);
    return reply.status(201).send(row);
  });

  // Reordering the whole list at once, rather than a per-field display_order patch: the order only
  // means anything relative to its siblings, and one request cannot leave two fields sharing a slot.
  app.put("/:entityType/:entityId/schema-fields/order", async (req, reply) => {
    const { entityType, entityId } = SchemaFieldParentParams.parse(req.params);
    const { field_ids } = SchemaFieldOrderSchema.parse(req.body);
    const rows = await service.reorderSchemaFields(entityType, entityId, field_ids);
    return reply.send({ schema_fields: rows });
  });

  app.patch("/schema-fields/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = SchemaFieldUpdateSchema.parse(req.body);
    const row = await service.updateSchemaField(id, data);
    return reply.send(row);
  });

  app.delete("/schema-fields/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteSchemaField(id);
    return reply.status(204).send();
  });

  // ── Business Categories ──

  app.get("/business-categories", async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listBusinessCategories(limit, offset, search),
      service.countBusinessCategories(search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/business-categories", async (req, reply) => {
    const data = CategoryInputSchema.parse(req.body);
    const row = await service.createBusinessCategory(data);
    return reply.status(201).send(row);
  });

  app.patch("/business-categories/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = CategoryInputSchema.partial().parse(req.body);
    const row = await service.updateBusinessCategory(id, data);
    return reply.send(row);
  });

  // Default service categories for a business category
  app.get("/business-categories/:id/default-services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const rows = await service.getDefaultServices(id);
    return reply.send({ services: rows });
  });

  app.put("/business-categories/:id/default-services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { service_category_ids } = DefaultServicesInputSchema.parse(req.body);
    await service.replaceDefaultServices(id, service_category_ids);
    return reply.send({ updated: true });
  });

  // ── Service Categories (business default-services taxonomy) ──

  app.get("/service-categories", async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listServiceCategories(limit, offset, search),
      service.countServiceCategories(search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/service-categories", async (req, reply) => {
    const data = CategoryInputSchema.parse(req.body);
    const row = await service.createServiceCategory(data);
    return reply.status(201).send(row);
  });

  app.patch("/service-categories/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = CategoryInputSchema.partial().parse(req.body);
    const row = await service.updateServiceCategory(id, data);
    return reply.send(row);
  });

  // ── Other Service Categories (Earn → My Services taxonomy) ──

  app.get("/other-service-categories", async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listOtherServiceCategories(limit, offset, search),
      service.countOtherServiceCategories(search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/other-service-categories", async (req, reply) => {
    const data = CategoryInputSchema.parse(req.body);
    const row = await service.createOtherServiceCategory(data);
    return reply.status(201).send(row);
  });

  app.patch("/other-service-categories/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = CategoryInputSchema.partial().parse(req.body);
    const row = await service.updateOtherServiceCategory(id, data);
    return reply.send(row);
  });

  // Soft delete, and refused with a 409 while listings still sell under it. Only this taxonomy has one:
  // business and service categories are referenced by approved businesses and cannot simply go away.
  app.delete("/other-service-categories/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteOtherServiceCategory(id);
    return reply.status(204).send();
  });
}
