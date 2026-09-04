import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as storage from "../../../shared/storage/storageService.js";
import { withImagePreviews } from "../../businesses/services/businesses.service.js";
import * as repo from "../repositories/businesses.repository.js";
import * as coursesRepo from "../repositories/courses.repository.js";
import {
  BusinessTabListQuery, CourseListQuery, InstitutionListQuery, ServiceListQuery, VisaServiceListQuery,
} from "../schemas/search.schema.js";

async function withRepresentationPreviews(reps: Awaited<ReturnType<typeof repo.listPublicRepresentations>>) {
  return Promise.all(reps.map(async (rep) => ({
    ...rep, partner_logo_url: await storage.resolvePreviewUrl(rep.partner_logo_url),
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
  // Facet options for the institutions filter panel — the types and intake months that are
  // actually represented, so the panel can't offer a filter that returns nothing.
  app.get("/search/institutions/filters", async (_req, reply) => {
    const [institution_types, intake_months, catalog] = await Promise.all([
      repo.listInstitutionTypes(),
      repo.listInstitutionIntakeMonths(),
      repo.listInstitutionCatalogFacets(),
    ]);
    return reply.send({ institution_types, intake_months, ...catalog });
  });

  app.get("/search/institutions", async (req, reply) => {
    const {
      country, city, search, institution_type, intake_from, subject_area, degree_level, study_mode, ...pagination
    } = InstitutionListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = {
      country, city, search, institutionType: institution_type, intakeFrom: intake_from,
      subjectArea: subject_area, degreeLevel: degree_level, studyMode: study_mode,
    };
    const [rawRows, total] = await Promise.all([
      repo.listPublicInstitutions(filters, limit, offset),
      repo.countPublicInstitutions(filters),
    ]);
    // Owner-registered institutions store logo_url as a storage key; scraped ones pass through untouched.
    const rows = await Promise.all(rawRows.map(async (r) => ({ ...r, logo_url: await storage.resolvePreviewUrl(r.logo_url) })));
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // The detail response carries everything the public profile renders in one round trip:
  // campuses (Locations), the course facets (subject-area grid + level tabs) and the team.
  // The catalog pieces hang off the extraction job, so a hand-registered institution — which
  // has no source_job_id — simply gets empty arrays and the page drops those sections.
  app.get("/search/institutions/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");

    const jobId = institution.job_id;
    const [row, campuses, rawMembers, facets, courseCount] = await Promise.all([
      withImagePreviews(institution),
      jobId ? repo.listInstitutionCampuses(jobId) : [],
      repo.listInstitutionMembers(Number(institution.id)),
      jobId ? coursesRepo.listCourseFacets(jobId) : { subject_areas: [], degree_levels: [] },
      jobId ? coursesRepo.countPublicCourses({ jobId }) : 0,
    ]);
    const members = await Promise.all(rawMembers.map(async (m) => ({
      ...m, photo_url: await storage.resolvePreviewUrl(m.photo_url),
    })));

    return reply.send({ ...row, campuses, members, ...facets, course_count: courseCount });
  });

  app.get("/search/institutions/:slug/courses", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const institution = await repo.findPublicInstitutionBySlug(slug);
    if (!institution) throw new NotFoundError("Institution not found");

    const { search, degree_level, ...pagination } = CourseListQuery.omit({ country: true, city: true }).parse(req.query);

    // A real (non-scraped) business has no extraction job, hence no scraped course rows — omitting
    // `jobId` from the filter would return every publicly-visible course across all scraped jobs instead.
    if (!institution.job_id) return reply.send(buildPaginatedResponse([], 0, pagination));

    const { limit, offset } = paginationToOffset(pagination);
    const filters = { jobId: institution.job_id, search, degreeLevel: degree_level };
    const [rows, total] = await Promise.all([
      coursesRepo.listPublicCourses(filters, undefined, limit, offset),
      coursesRepo.countPublicCourses(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // The category catalog behind the public search switcher — admins manage these rows, so the
  // switcher should follow them rather than a hardcoded list.
  app.get("/search/business-categories", async (_req, reply) =>
    reply.send({ categories: await repo.listPublicBusinessCategories() }),
  );

  // Facet options for the visa-services filter panel.
  app.get("/search/visa-services/filters", async (_req, reply) =>
    reply.send(await repo.listVisaServiceFacets()),
  );

  app.get("/search/visa-services", async (req, reply) => {
    const {
      country, city, search, licensed_only, service_type, ...pagination
    } = VisaServiceListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = {
      country, city, search, licensedOnly: licensed_only, serviceType: service_type,
    };
    const [rows, total] = await Promise.all([
      repo.listPublicVisaServiceProviders(filters, limit, offset),
      repo.countPublicVisaServiceProviders(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // Scraped visa-service providers have no `businesses` row (hence no subdomain), so their
  // profile page resolves by slug here instead of through /search/businesses/:subdomain.
  app.get("/search/visa-services/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const provider = await repo.findPublicVisaServiceProviderBySlug(slug);
    if (!provider) throw new NotFoundError("Visa service provider not found");

    const { job_id, ...publicProvider } = provider;
    const [logo_url, services] = await Promise.all([
      storage.resolvePreviewUrl(provider.logo_url),
      repo.listPublicVisaServicesForJob(job_id),
    ]);
    return reply.send({ ...publicProvider, logo_url, services });
  });

  for (const { path, businessType } of TABS) {
    app.get(path, async (req, reply) => {
      const { country, city, search, verified_only, ...pagination } = BusinessTabListQuery.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const filters = { businessType, country, city, search, verifiedOnly: verified_only };
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

    // gallery_images/video_urls are raw storage paths — only their resolved forms go out.
    const { schema_name, schema_provisioned_at, gallery_images, video_urls, source_agent_id, ...publicBusiness } = business;
    // Team Members has its own owner-controlled visibility toggle (public_visibility.team) —
    // hidden by default only when explicitly turned off, same convention the other section
    // toggles use.
    const showTeam = publicBusiness.public_visibility?.team !== false;
    // Same convention for the Registration & Licenses card.
    const showRegistration = publicBusiness.public_visibility?.registration !== false;
    // Promoted-but-unclaimed listings have no tenant schema yet (see promote.service) —
    // their branches/team/services sections are simply empty.
    const hasSchema = Boolean(schema_provisioned_at);
    const [media, branches, members, services, representations] = await Promise.all([
      withImagePreviews({ ...publicBusiness, gallery_images, video_urls }),
      // No tenant schema yet → the listing's offices are the scraped ones (see listScrapedBranches).
      hasSchema
        ? repo.listPublicBranches(business.id, schema_name)
        : source_agent_id ? repo.listScrapedBranches(source_agent_id) : Promise.resolve([]),
      hasSchema && showTeam ? repo.listPublicMembers(business.id, schema_name) : Promise.resolve([]),
      hasSchema ? repo.listPublicServices(business.id, schema_name) : Promise.resolve([]),
      repo.listPublicRepresentations(business.id).then(withRepresentationPreviews),
    ]);

    return reply.send({
      ...publicBusiness,
      ...(showRegistration ? {} : { business_registration_number: null, registration_licenses: null }),
      logo_url: media.logo_url,
      cover_url: media.cover_url,
      gallery_image_urls: media.gallery_image_urls ?? [],
      video_urls: media.video_urls ?? [],
      branches, members, services, representations,
    });
  });
}

