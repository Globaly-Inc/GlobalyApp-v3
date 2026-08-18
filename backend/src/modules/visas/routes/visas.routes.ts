// Public visa directory — V1's search_visas / get_visa_detail RPCs.

import type { FastifyInstance } from "fastify";

import { VisaDetailParamsSchema, VisaListQuerySchema } from "../schemas/visas.schema.js";
import * as service from "../services/visas.service.js";

export async function visasRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = VisaListQuerySchema.parse(req.query);
    return reply.send(await service.searchVisas(query));
  });

  app.get("/:country/:subclass", async (req, reply) => {
    const { country, subclass } = VisaDetailParamsSchema.parse(req.params);
    return reply.send(await service.getVisa(country, subclass));
  });
}
