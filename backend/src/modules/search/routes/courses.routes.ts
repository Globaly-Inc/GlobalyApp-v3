import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as repo from "../repositories/courses.repository.js";
import * as manualRepo from "../repositories/manual-courses.repository.js";
import { CourseListQuery } from "../schemas/search.schema.js";
import { courseSlug } from "../utils/slug.js";
import { withCardFields } from "../utils/course-card-fields.js";

const SlugParam = z.object({ slug: z.string().min(1) });

export async function searchCoursesRoutes(app: FastifyInstance) {
  app.get("/search/courses/filters", async (_req, reply) => {
    const options = await repo.listCourseFilterOptions();
    return reply.send(options);
  });

  // The detail response folds the flat provider/country columns into the two objects the page
  // renders from — the awarding institution (hero, "Awarded by", campus list) and the
  // destination country's seasonal weather.
  app.get("/search/courses/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const course = await repo.findPublicCourseBySlug(slug);
    if (!course) {
      // Not an extraction course — try a manually-added "courses"-category business_service
      // before giving up (see manual-courses.repository.ts).
      const manual = await manualRepo.findPublicManualCourseBySlug(slug);
      if (!manual) throw new NotFoundError("Course not found");
      const [institutionLogo, institutionCover] = await Promise.all([
        storage.resolvePreviewUrl(manual.institution_logo_url),
        storage.resolvePreviewUrl(manual.institution.cover_url),
      ]);
      return reply.send({
        ...manual,
        institution_logo_url: institutionLogo,
        institution: { ...manual.institution, logo_url: institutionLogo, cover_url: institutionCover },
      });
    }

    const {
      job_id, institution_id, institution_name, institution_cover_url, institution_website, institution_city,
      institution_gallery_images,
      institution_facebook_url, institution_instagram_url, institution_twitter_url,
      institution_linkedin_url, institution_youtube_url,
      weather_summer, weather_autumn, weather_winter, weather_spring, ...rest
    } = course;

    const [card, campuses, coverUrl, galleryUrls, cityLink] = await Promise.all([
      withCardFields(rest),
      job_id ? repo.listCourseCampuses(course.id, job_id) : [],
      storage.resolvePreviewUrl(institution_cover_url ?? null),
      Promise.all(((institution_gallery_images ?? []) as string[]).map((key) => storage.resolvePreviewUrl(key))),
      repo.findCityLink(institution_city ?? null, course.country_code ?? null),
    ]);

    // The institution's public slug is name + its zero-padded id, the same scheme
    // findPublicInstitutionBySlug parses back — so the hero can link straight to its profile.
    const institution = institution_id
      ? {
        id: String(institution_id),
        slug: courseSlug(institution_name, String(institution_id).padStart(6, "0")),
        name: institution_name,
        logo_url: card.institution_logo_url,
        cover_url: coverUrl,
        website: institution_website,
        city: institution_city,
        gallery_image_urls: galleryUrls,
        facebook_url: institution_facebook_url,
        instagram_url: institution_instagram_url,
        twitter_url: institution_twitter_url,
        linkedin_url: institution_linkedin_url,
        youtube_url: institution_youtube_url,
      }
      : null;

    const hasWeather = Boolean(weather_summer || weather_autumn || weather_winter || weather_spring);

    return reply.send({
      ...card,
      institution,
      campuses,
      study_units: course.study_units,
      study_options: course.study_options,
      city_link: cityLink,
      weather: hasWeather
        ? { summer: weather_summer, autumn: weather_autumn, winter: weather_winter, spring: weather_spring }
        : null,
    });
  });

  app.get("/search/courses", async (req, reply) => {
    const {
      country, city, degree_level, subject_area, search, fee_min, fee_max, currency, intake_year, sort,
      institution, duration, ...pagination
    } = CourseListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = {
      country, city, degreeLevel: degree_level, subjectArea: subject_area, search,
      feeMin: fee_min, feeMax: fee_max, currency, intakeYear: intake_year,
      institution, duration,
    };

    // Manually-added "courses"-category business_services (see manual-courses.repository.ts)
    // never made it into extraction_courses, so a plain name search wouldn't find them. The
    // actual cards are only fetched for page 1 (capped to `limit`, and subtracted from the
    // extraction page's own limit so a page never returns more than `limit` rows total), but the
    // *count* is fetched for every page so `total`/`totalPages` stay consistent across pages —
    // see that file's header for why filters beyond plain search aren't shared with either.
    // ponytail: with manual matches present, extraction rows shown on page 2+ shift by up to
    // `limit` compared to page 1 (offsets aren't adjusted for what page 1 held back) — an
    // accepted rough edge for what's meant to surface a handful of manually-added courses, not
    // paginate a mixed catalog exactly.
    const noIncompatibleFilters = !country && !city && !degree_level && !subject_area
      && fee_min == null && fee_max == null && !currency && intake_year == null && !institution && !duration;

    let manualCards: Awaited<ReturnType<typeof withCardFields>>[] = [];
    let manualTotal = 0;
    if (search && noIncompatibleFilters) {
      const searchTerm = search;
      [manualCards, manualTotal] = await Promise.all([
        pagination.page === 1
          ? Promise.all((await manualRepo.listPublicManualCourses(searchTerm)).map(withCardFields)).then((c) => c.slice(0, limit))
          : Promise.resolve([]),
        manualRepo.countPublicManualCourses(searchTerm),
      ]);
    }

    const [rows, total] = await Promise.all([
      repo.listPublicCourses(filters, sort, limit - manualCards.length, offset),
      repo.countPublicCourses(filters),
    ]);
    const cardRows = await Promise.all(rows.map(withCardFields));

    return reply.send(buildPaginatedResponse([...manualCards, ...cardRows], total + manualTotal, pagination));
  });
}
