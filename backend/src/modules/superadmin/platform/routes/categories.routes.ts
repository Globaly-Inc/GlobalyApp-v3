// Superadmin category management routes — business categories + service categories.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as repo from "../platform.repository.js";

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const CategoryInput = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const DefaultServicesInput = z.object({
  service_category_ids: z.array(z.number().int().positive()),
});

export async function adminCategoryRoutes(app: FastifyInstance) {
  // ── Business Categories ──

  app.get("/business-categories", async (_req, reply) => {
    const rows = await repo.listBusinessCategories();
    return reply.send({ categories: rows });
  });

  app.post("/business-categories", async (req, reply) => {
    const data = CategoryInput.parse(req.body);
    const row = await repo.insertBusinessCategory(data);
    return reply.status(201).send(row);
  });

  app.patch("/business-categories/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const data = CategoryInput.partial().parse(req.body);
    const row = await repo.updateBusinessCategory(id, data);
    return reply.send(row);
  });

  // Default service categories for a business category
  app.get("/business-categories/:id/default-services", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const rows = await repo.getDefaultServices(id);
    return reply.send({ services: rows });
  });

  app.put("/business-categories/:id/default-services", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { service_category_ids } = DefaultServicesInput.parse(req.body);
    await repo.replaceDefaultServices(id, service_category_ids);
    return reply.send({ updated: true });
  });

  // ── Service Categories ──

  app.get("/service-categories", async (_req, reply) => {
    const rows = await repo.listServiceCategories();
    return reply.send({ categories: rows });
  });

  app.post("/service-categories", async (req, reply) => {
    const data = CategoryInput.parse(req.body);
    const row = await repo.insertServiceCategory(data);
    return reply.status(201).send(row);
  });

  app.patch("/service-categories/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const data = CategoryInput.partial().parse(req.body);
    const row = await repo.updateServiceCategory(id, data);
    return reply.send(row);
  });
}
