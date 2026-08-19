import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../../superadmin/platform/platform.repository.js";
import { withCityImagePreviews, withImagePreviews } from "../../superadmin/platform/routes/countries.routes.js";

const SlugParam = z.object({ slug: z.string().min(1) });

export async function publicGeoRoutes(app: FastifyInstance) {
  app.get("/countries/featured", async (_req, reply) => {
    // Same preview resolution as the country detail route: a hero set from an admin upload is a
    // storage path, not a URL, and would render as a broken image without it.
    const countries = await Promise.all((await repo.listFeaturedCountries()).map(withImagePreviews));
    return reply.send({ countries });
  });

  // Registered before /countries/:slug so "featured" and this list are never read as
  // slugs. Public pages with a country picker used to read the admin
  // /platform-users/countries list, which 401s for a logged-out visitor — and the shared
  // http client hard-redirects any 401 to /auth/sign-in, so the whole page bounced.
  app.get("/countries", async (_req, reply) => {
    const countries = await repo.listPublicCountries();
    return reply.send({ countries });
  });

  // Two segments, so it never competes with /countries/:slug above. Same reason as
  // /countries: the country→city cascade on a public picker was reading the admin list.
  app.get("/countries/:id/cities", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const cities = await repo.listPublicCitiesForCountry(id, 500);
    return reply.send({ cities });
  });

  app.get("/countries/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const country = await repo.findPublicCountryBySlug(slug);
    if (!country) throw new NotFoundError("Country not found");
    const [previewedCountry, rawCities] = await Promise.all([
      withImagePreviews(country),
      repo.listPublicCitiesForCountry(country.id),
    ]);
    const cities = await Promise.all(rawCities.map(withCityImagePreviews));
    return reply.send({ ...previewedCountry, cities });
  });

  app.get("/cities/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const { country } = z.object({ country: z.string().optional() }).parse(req.query);
    const row = await repo.findPublicCityBySlug(slug, country);
    if (!row) throw new NotFoundError("City not found");
    const { country_id, country_name, country_slug, country_flag_emoji, ...city } = row;
    const previewedCity = await withCityImagePreviews(city);
    return reply.send({
      ...previewedCity,
      country: { id: country_id, name: country_name, slug: country_slug, flag_emoji: country_flag_emoji },
    });
  });
}
