// Read-only category/lookup catalogs for the service add/edit form —
// same data as the admin platform catalogs, scoped to any authenticated business.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import * as categoriesService from "../../superadmin/platform/categories/services/categories.service.js";
import { AccreditationInputSchema, IssuingOrgInputSchema } from "../../superadmin/platform/categories/schemas/categories.schema.js";
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

  // approvedOnly=true — a pending self-proposed entry isn't vetted yet, so another org picking
  // from this shared list must not see (and be able to claim) it before an admin reviews it.
  app.get("/accreditations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listAccreditations(limit, offset, true),
      categoriesService.countAccreditations(true),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Accreditations/issuing orgs are a shared global catalog (same one admin curates) — the
  // "Add a new accreditation" path in the self-service Accreditations tab mirrors admin's
  // one-for-one, so it writes to the same catalog rather than a business-scoped copy.
  app.get("/issuing-organizations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, ...pagination } = CategoryListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listIssuingOrganizations(limit, offset, search, true),
      categoriesService.countIssuingOrganizations(search, true),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Unlike admin's createIssuingOrganization, this starts pending — an admin has to review it
  // before another org can see/select it from the shared catalog (see proposeIssuingOrganization).
  app.post("/issuing-organizations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const data = IssuingOrgInputSchema.parse(req.body);
    return reply.status(201).send(await categoriesService.proposeIssuingOrganization(data));
  });

  // Unlike admin's createAccreditation, this starts pending/non-global — an admin has to
  // reviewAccreditation it before it's a vetted, globally-trusted catalog entry (see
  // proposeAccreditation's comment).
  app.post("/accreditations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const data = AccreditationInputSchema.parse(req.body);
    return reply.status(201).send(await categoriesService.proposeAccreditation(data));
  });

  // Read-only — the admin catalog also lets an admin propose/review new fee types, which stays
  // admin-only; a self-service caller only ever picks from the existing approved list.
  app.get("/fee-types", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      categoriesService.listFeeTypes(limit, offset),
      categoriesService.countFeeTypes(),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
