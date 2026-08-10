// Superadmin business management routes.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse, PaginationSchema } from "../../../../shared/pagination.js";
import * as repo from "../platform.repository.js";

const IdParam = z.object({ id: z.string().uuid() });
const ListQuery = PaginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
});
const StatusPatch = z.object({ status: z.enum(["pending", "verified", "rejected", "suspended", "archived"]) });
const PublishedPatch = z.object({ is_published: z.boolean() });
const BusinessPatch = z.object({
  business_name: z.string().min(1),
  business_type: z.string().nullable(),
  description: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  country_id: z.number().int().positive().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
}).partial().strict();

export async function adminBusinessRoutes(app: FastifyInstance) {
  // GET /businesses
  app.get("/businesses", async (req, reply) => {
    const { search, status, ...pagination } = ListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      repo.listBusinesses(limit, offset, search, status),
      repo.countBusinesses(search, status),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /businesses/:id
  app.get("/businesses/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const biz = await repo.findBusinessById(id);
    if (!biz) throw new NotFoundError("Business not found");
    return reply.send(biz);
  });

  // PATCH /businesses/:id
  app.patch("/businesses/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const data = BusinessPatch.parse(req.body);
    const existing = await repo.findBusinessById(id);
    if (!existing) throw new NotFoundError("Business not found");
    const updated = await repo.updateBusiness(id, data);
    await repo.logAdminAction(Number(req.auth.sub), "BUSINESS_UPDATED", "business", id, data);
    return reply.send(updated);
  });

  // PATCH /businesses/:id/status
  app.patch("/businesses/:id/status", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { status } = StatusPatch.parse(req.body);
    const existing = await repo.findBusinessById(id);
    if (!existing) throw new NotFoundError("Business not found");
    const updates: Record<string, unknown> = { status };
    if (status === "verified") updates.verified_at = new Date();
    await repo.updateBusiness(id, updates);
    await repo.logAdminAction(Number(req.auth.sub), `BUSINESS_STATUS_${status.toUpperCase()}`, "business", id);
    return reply.send({ status });
  });

  // PATCH /businesses/:id/published
  app.patch("/businesses/:id/published", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { is_published } = PublishedPatch.parse(req.body);
    const existing = await repo.findBusinessById(id);
    if (!existing) throw new NotFoundError("Business not found");
    await repo.updateBusiness(id, { is_published });
    await repo.logAdminAction(Number(req.auth.sub), is_published ? "BUSINESS_PUBLISHED" : "BUSINESS_UNPUBLISHED", "business", id);
    return reply.send({ is_published });
  });

  // DELETE /businesses/:id
  app.delete("/businesses/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const existing = await repo.findBusinessById(id);
    if (!existing) throw new NotFoundError("Business not found");
    await repo.deleteBusiness(id);
    await repo.logAdminAction(Number(req.auth.sub), "BUSINESS_DELETED", "business", id);
    return reply.status(204).send();
  });
}
