import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cached } from "../../../core/cache/dragonfly.js";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../../superadmin/platform/platform.repository.js";
import { withCityImagePreviews, withImagePreviews } from "../../superadmin/platform/routes/countries.routes.js";

const SlugParam = z.object({ slug: z.string().min(1) });

/** The city catalogue is admin-edited and rarely moves; a whole day off the hot path is fine. */
const TIMEZONE_MAP_TTL_SECONDS = 86_400;

export async function publicGeoRoutes(app: FastifyInstance) {
  /**
   * IANA timezone → ISO-2, for ordering the homepage destination cards around the visitor.
   * A flat object keyed by zone so the client can look up its own zone without scanning.
   */
  app.get("/countries/timezones", async (_req, reply) => {
    const timezones = await cached("public:timezone-country-map", TIMEZONE_MAP_TTL_SECONDS, async () =>
      Object.fromEntries((await repo.listTimezoneCountryPairs()).map((r) => [r.timezone, r.iso2])),
    );
    return reply.send({ timezones });
  });

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
    const { country_id, country_name, country_slug, country_flag_emoji, country_hero_image_url, ...city } = row;
    const previewedCity = await withCityImagePreviews({
      ...city,
      hero_image_url: city.hero_image_url ?? country_hero_image_url,
    });
    return reply.send({
      ...previewedCity,
      country: { id: country_id, name: country_name, slug: country_slug, flag_emoji: country_flag_emoji },
    });
  });
}
