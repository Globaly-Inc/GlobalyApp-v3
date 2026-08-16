import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/businesses.repository.js";
import { SearchListQuery } from "../schemas/search.schema.js";

// One tab per business_categories slug — institutions, education agencies,
// visa services, and migration agents are all the same `businesses` shape.
const TABS = [
  { path: "/search/institutions", categorySlug: "institutions" },
  { path: "/search/education-agencies", categorySlug: "education_agency" },
  { path: "/search/visa-services", categorySlug: "visa_services" },
  { path: "/search/migration-agents", categorySlug: "migration_agents" },
];

export async function searchBusinessesRoutes(app: FastifyInstance) {
  for (const { path, categorySlug } of TABS) {
    app.get(path, async (req, reply) => {
      const { country, city, search, ...pagination } = SearchListQuery.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const filters = { categorySlug, country, city, search };
      const [rows, total] = await Promise.all([
        repo.listPublicBusinesses(filters, limit, offset),
        repo.countPublicBusinesses(filters),
      ]);
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });
  }
}
