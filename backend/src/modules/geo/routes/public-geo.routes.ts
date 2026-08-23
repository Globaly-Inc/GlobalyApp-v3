import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../../superadmin/platform/platform.repository.js";
import { withCityImagePreviews, withImagePreviews } from "../../superadmin/platform/routes/countries.routes.js";

const SlugParam = z.object({ slug: z.string().min(1) });

export async function publicGeoRoutes(app: FastifyInstance) {
  app.get("/countries/featured", async (_req, reply) => {
    const rows = await repo.listFeaturedCountries();
    const countries = await Promise.all(rows.map(withImagePreviews));
    return reply.send({ countries });
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
