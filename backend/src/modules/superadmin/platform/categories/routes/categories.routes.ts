// Category management routes — business categories + service categories.

import type { FastifyInstance } from "fastify";
import { CategoryInputSchema, DefaultServicesInputSchema, IdParamSchema } from "../schemas/categories.schema.js";
import * as service from "../services/categories.service.js";

export async function categoryRoutes(app: FastifyInstance) {
  // ── Business Categories ──

  app.get("/business-categories", async (_req, reply) => {
    const rows = await service.listBusinessCategories();
    return reply.send({ categories: rows });
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

  // ── Service Categories ──

  app.get("/service-categories", async (_req, reply) => {
    const rows = await service.listServiceCategories();
    return reply.send({ categories: rows });
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
}
