// Public scholarship reads — no auth, published rows only.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { PublicScholarshipListQuery, SlugParamSchema } from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import * as service from "../../superadmin/monitoring/scholarships/services/scholarships.service.js";

export async function publicScholarshipRoutes(app: FastifyInstance) {
  app.get("/scholarships", async (req, reply) => {
    const { q, country, basis, coverage_type, degree_level, coverage_min, ...pagination } = PublicScholarshipListQuery.parse(req.query);
    const filters = { q, country, basis, coverage_type, degree_level, coverage_min };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listPublished(limit, offset, filters),
      service.countPublished(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/scholarships/:slug", async (req, reply) => {
    const { slug } = SlugParamSchema.parse(req.params);
    const row = await service.findPublishedBySlug(slug);
    return reply.send(row);
  });
}
