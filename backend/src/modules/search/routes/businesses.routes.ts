import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as storage from "../../../shared/storage/storageService.js";
import { withImagePreviews } from "../../businesses/services/businesses.service.js";
import * as repo from "../repositories/businesses.repository.js";
import * as coursesRepo from "../repositories/courses.repository.js";
import { SearchListQuery, VisaServiceListQuery } from "../schemas/search.schema.js";

async function withRepresentationPreviews(reps: Awaited<ReturnType<typeof repo.listPublicRepresentations>>) {
  return Promise.all(reps.map(async (rep) => ({
    ...rep, partner_business_logo_url: await storage.resolvePreviewUrl(rep.partner_business_logo_url),
  })));
}

const SlugParam = z.object({ slug: z.string().min(1) });
const SubdomainParam = z.object({ subdomain: z.string().min(1) });

const TABS = [
  { path: "/search/education-agencies", categorySlug: "education_agency" },
  { path: "/search/migration-agents", categorySlug: "migration_agents" },
];

export async function searchBusinessesRoutes(app: FastifyInstance) {
  // Institutions have no live `businesses` catalog rows yet — served from
  // scraped extraction data instead (see businesses.repository.ts header).
  app.get("/search/institutions", async (req, reply) => {
    const { country, city, search, ...pagination } = SearchListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = { country, city, search };
    const [rows, total] = await Promise.all([
      repo.listPublicInstitutions(filters, limit, offset),
      repo.countPublicInstitutions(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/search/institutions/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");
    return reply.send(institution);
  });

  app.get("/search/institutions/:slug/courses", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");

    const { search, ...pagination } = SearchListQuery.omit({ country: true, city: true }).parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = { jobId: institution.job_id, search };
    const [rows, total] = await Promise.all([
      coursesRepo.listPublicCourses(filters, undefined, limit, offset),
      coursesRepo.countPublicCourses(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/search/visa-services", async (req, reply) => {
    const { country, city, search, licensed_only, ...pagination } = VisaServiceListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = { country, city, search, licensedOnly: licensed_only };
    const [rows, total] = await Promise.all([
      repo.listPublicVisaServiceProviders(filters, limit, offset),
      repo.countPublicVisaServiceProviders(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  for (const { path, categorySlug } of TABS) {
    app.get(path, async (req, reply) => {
      const { country, city, search, ...pagination } = SearchListQuery.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const filters = { categorySlug, country, city, search };
      const [rawRows, total] = await Promise.all([
        repo.listPublicBusinesses(filters, limit, offset),
        repo.countPublicBusinesses(filters),
      ]);
      const rows = await Promise.all(rawRows.map(withImagePreviews));
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });
  }

  app.get("/search/businesses/:subdomain", async (req, reply) => {
    const { subdomain } = SubdomainParam.parse(req.params);
    const business = await repo.findPublicBusinessBySubdomain(subdomain);
    if (!business) throw new NotFoundError("Business not found");

    const { schema_name, ...publicBusiness } = business;
    const [{ logo_url, cover_url }, branches, members, services, representations] = await Promise.all([
      withImagePreviews(publicBusiness),
      repo.listPublicBranches(business.id, schema_name),
      repo.listPublicMembers(business.id, schema_name),
      repo.listPublicServices(business.id, schema_name),
      repo.listPublicRepresentations(business.id).then(withRepresentationPreviews),
    ]);

    return reply.send({ ...publicBusiness, logo_url, cover_url, branches, members, services, representations });
  });
}
