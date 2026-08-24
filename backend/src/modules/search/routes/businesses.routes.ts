import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as storage from "../../../shared/storage/storageService.js";
import { withImagePreviews } from "../../businesses/services/businesses.service.js";
import * as repo from "../repositories/businesses.repository.js";
import * as coursesRepo from "../repositories/courses.repository.js";
import { SearchListQuery, ServiceListQuery, VisaServiceListQuery } from "../schemas/search.schema.js";

async function withRepresentationPreviews(reps: Awaited<ReturnType<typeof repo.listPublicRepresentations>>) {
  return Promise.all(reps.map(async (rep) => ({
    ...rep, partner_business_logo_url: await storage.resolvePreviewUrl(rep.partner_business_logo_url),
  })));
}

const SlugParam = z.object({ slug: z.string().min(1) });
const SubdomainParam = z.object({ subdomain: z.string().min(1) });

// Maps a search tab directly to the signup-time `business_type` — see BusinessSearchFilters.
const TABS = [
  { path: "/search/education-agencies", businessType: "agent" },
  { path: "/search/migration-agents", businessType: "immigration_department" },
];

export async function searchBusinessesRoutes(app: FastifyInstance) {
  // Served from the public `institutions` table — promoted extraction jobs and
  // owner-registered institutions, gated by is_published (see institutionsQuery).
  app.get("/search/institutions", async (req, reply) => {
    const { country, city, search, ...pagination } = SearchListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = { country, city, search };
    const [rawRows, total] = await Promise.all([
      repo.listPublicInstitutions(filters, limit, offset),
      repo.countPublicInstitutions(filters),
    ]);
    // Owner-registered institutions store logo_url as a storage key; scraped ones pass through untouched.
    const rows = await Promise.all(rawRows.map(async (r) => ({ ...r, logo_url: await storage.resolvePreviewUrl(r.logo_url) })));
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/search/institutions/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");
    return reply.send({ ...institution, logo_url: await storage.resolvePreviewUrl(institution.logo_url) });
  });

  app.get("/search/institutions/:slug/courses", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");

    const { search, ...pagination } = SearchListQuery.omit({ country: true, city: true }).parse(req.query);

    // A real (non-scraped) business has no extraction job, hence no scraped course rows — omitting
    // `jobId` from the filter would return every publicly-visible course across all scraped jobs instead.
    if (!institution.job_id) return reply.send(buildPaginatedResponse([], 0, pagination));

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

  for (const { path, businessType } of TABS) {
    app.get(path, async (req, reply) => {
      const { country, city, search, ...pagination } = SearchListQuery.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const filters = { businessType, country, city, search };
      const [rawRows, total] = await Promise.all([
        repo.listPublicBusinesses(filters, limit, offset),
        repo.countPublicBusinesses(filters),
      ]);
      const rows = await Promise.all(rawRows.map(withImagePreviews));
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });
  }

  app.get("/search/services", async (req, reply) => {
    const { search, category, ...pagination } = ServiceListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const all = await repo.listPublicServicesAcrossBusinesses({ search, category });
    const page = all.slice(offset, offset + limit);
    const rows = await Promise.all(page.map(async (row) => ({ ...row, logo_url: await storage.resolvePreviewUrl(row.logo_url) })));
    return reply.send(buildPaginatedResponse(rows, all.length, pagination));
  });

  app.get("/search/businesses/:subdomain", async (req, reply) => {
    const { subdomain } = SubdomainParam.parse(req.params);
    const business = await repo.findPublicBusinessBySubdomain(subdomain);
    if (!business) throw new NotFoundError("Business not found");

    const { schema_name, schema_provisioned_at, ...publicBusiness } = business;
    // Team Members has its own owner-controlled visibility toggle (public_visibility.team) —
    // hidden by default only when explicitly turned off, same convention the other section
    // toggles use.
    const showTeam = publicBusiness.public_visibility?.team !== false;
    // Promoted-but-unclaimed listings have no tenant schema yet (see promote.service) —
    // their branches/team/services sections are simply empty.
    const hasSchema = Boolean(schema_provisioned_at);
    const [{ logo_url, cover_url }, branches, members, services, representations] = await Promise.all([
      withImagePreviews(publicBusiness),
      hasSchema ? repo.listPublicBranches(business.id, schema_name) : Promise.resolve([]),
      hasSchema && showTeam ? repo.listPublicMembers(business.id, schema_name) : Promise.resolve([]),
      hasSchema ? repo.listPublicServices(business.id, schema_name) : Promise.resolve([]),
      repo.listPublicRepresentations(business.id).then(withRepresentationPreviews),
    ]);

    return reply.send({ ...publicBusiness, logo_url, cover_url, branches, members, services, representations });
  });
}
