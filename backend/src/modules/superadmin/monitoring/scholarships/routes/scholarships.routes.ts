// Scholarship management routes — admin CRUD (role-gated by the parent monitoring module).

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as repo from "../../../platform/platform.repository.js";
import { IdParamSchema, ScholarshipInputSchema, ScholarshipListQuery } from "../schemas/scholarships.schema.js";
import * as service from "../services/scholarships.service.js";

export async function scholarshipRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { search, is_published, country, ...pagination } = ScholarshipListQuery.parse(req.query);
    const filters = { search, is_published, country };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listAdmin(limit, offset, filters),
      service.countAdmin(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.findById(id);
    return reply.send(row);
  });

  app.post("/", async (req, reply) => {
    const data = ScholarshipInputSchema.parse(req.body);
    const row = await service.create(data);
    await repo.logAdminAction(Number(req.auth.sub), "SCHOLARSHIP_CREATED", "scholarship", undefined, { scholarship_id: row.id, title: row.title });
    return reply.status(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ScholarshipInputSchema.partial().parse(req.body);
    const row = await service.update(id, data);
    await repo.logAdminAction(Number(req.auth.sub), "SCHOLARSHIP_UPDATED", "scholarship", undefined, { scholarship_id: id, fields: Object.keys(data) });
    return reply.send(row);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.remove(id);
    await repo.logAdminAction(Number(req.auth.sub), "SCHOLARSHIP_DELETED", "scholarship", undefined, { scholarship_id: id });
    return reply.status(204).send();
  });
}
