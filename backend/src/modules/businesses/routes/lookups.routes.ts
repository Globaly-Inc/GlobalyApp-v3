// Read-only category/lookup catalogs for the service add/edit form —
// same data as the admin platform catalogs, scoped to any authenticated business.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import * as categoriesService from "../../superadmin/platform/categories/services/categories.service.js";
const CategoryListQuery = PaginationSchema.extend({
  search: z.string().trim().min(1).optional(),
});

const RegistrationTypesQuery = z.object({
  country_id: z.coerce.number().int().positive().optional(),
});

export async function businessLookupsRoutes(app: FastifyInstance) {
  app.get("/service-categories", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listServiceCategories(limit, offset, search, { active: true }),
      categoriesService.countServiceCategories(search, { active: true }),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // No business-context guard: business onboarding fetches this BEFORE any business exists
  // (the user picks a category to register with). JWT is still required by the auth plugin.
  app.get("/business-categories", async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listBusinessCategories(limit, offset, search, { active: true }),
      categoriesService.countBusinessCategories(search, { active: true }),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Same columns and same behaviour, so both mount from one definition.
  for (const [path, table] of [
    ["degree-levels", "degree_levels"],
    ["areas-of-study", "areas_of_study"],
  ] as const) {
    app.get(`/${path}`, { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
      const { search, ...pagination } = CategoryListQuery.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const [rows, total] = await Promise.all([
        categoriesService.listLookup(table, limit, offset, search),
        categoriesService.countLookup(table, search),
      ]);
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });
  }

  /**
   * The registration-identifier options for the profile's Registration & Licenses card.
   *
   * Unpaginated and fallback-resolved on purpose: a country has a handful of these at most, and
   * "use the generic set when this country has none of its own" is one rule that belongs on one
   * side of the wire — not re-implemented by every client that draws the picker.
   */
  app.get("/registration-types", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { country_id } = RegistrationTypesQuery.parse(req.query);
    const rows = await categoriesService.listActiveRegistrationTypes(country_id);
    return reply.send({ data: rows });
  });

  app.get("/accreditations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listAccreditations(limit, offset),
      categoriesService.countAccreditations(),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
