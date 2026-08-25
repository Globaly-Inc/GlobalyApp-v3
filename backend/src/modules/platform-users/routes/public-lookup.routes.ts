import type { FastifyInstance } from "fastify";
import { CountryIdParamSchema } from "../schemas/platform-users.schema.js";
import * as service from "../services/platform-users.service.js";

export async function publicLookupRoutes(app: FastifyInstance) {
  app.get("/countries", async (_req, reply) => {
    const result = await service.listCountries();
    return reply.send({ countries: result });
  });

  app.get("/countries/:id/cities", async (req, reply) => {
    const { id } = CountryIdParamSchema.parse(req.params);
    const result = await service.getCitiesByCountry(id);
    return reply.send(result);
  });
}
