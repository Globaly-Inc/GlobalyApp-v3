import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../../superadmin/platform/platform.repository.js";

const SlugParam = z.object({ slug: z.string().min(1) });

export async function publicGeoRoutes(app: FastifyInstance) {
  app.get("/countries/featured", async (_req, reply) => {
    const countries = await repo.listFeaturedCountries();
    return reply.send({ countries });
  });

  app.get("/countries/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const country = await repo.findPublicCountryBySlug(slug);
    if (!country) throw new NotFoundError("Country not found");
    const cities = await repo.listPublicCitiesForCountry(country.id);
    return reply.send({ ...country, cities });
  });
}
