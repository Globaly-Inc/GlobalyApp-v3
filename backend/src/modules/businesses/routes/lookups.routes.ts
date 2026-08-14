// Read-only category/lookup catalogs for the service add/edit form —
// same data as the admin platform catalogs, scoped to any authenticated business.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as categoriesService from "../../superadmin/platform/categories/services/categories.service.js";

const CategoryListQuery = PaginationSchema.extend({
  search: z.string().trim().min(1).optional(),
});

export async function businessLookupsRoutes(app: FastifyInstance) {
  app.get("/service-categories", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listServiceCategories(limit, offset, search),
      categoriesService.countServiceCategories(search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Same columns and same behaviour, so both mount from one definition.
  for (const [path, table] of [
    ["degree-levels", "degree_levels"],
    ["areas-of-study", "areas_of_study"],
  ] as const) {
    app.get(`/${path}`, { preHandler: requireBusinessContext }, async (req, reply) => {
      const pagination = PaginationSchema.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const [rows, total] = await Promise.all([
        categoriesService.listLookup(table, limit, offset),
        categoriesService.countLookup(table),
      ]);
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });
  }

  app.get("/accreditations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listAccreditations(limit, offset),
      categoriesService.countAccreditations(),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
