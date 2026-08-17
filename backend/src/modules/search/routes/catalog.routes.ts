// Public catalog routes. Registered without the auth plugin — these serve
// unauthenticated visitors browsing published services.

import type { FastifyInstance } from "fastify";

import * as service from "../services/catalog.service.js";
import { ListServicesQuerySchema, ServiceIdParamSchema } from "../schemas/catalog.schema.js";

export async function catalogRoutes(app: FastifyInstance) {
  // Browse + search in one place: `q` is the search term, everything else filters.
  // A separate /search endpoint would be the same query with a required param.
  app.get("/services", async (req, reply) => {
    const query = ListServicesQuerySchema.parse(req.query);
    return reply.send(await service.listServices(query));
  });

  // Facet counts for the filter sidebar, restricted to values with live services.
  app.get("/filters", async (_req, reply) => {
    return reply.send(await service.getFacets());
  });

  app.get("/services/:id", async (req, reply) => {
    const { id } = ServiceIdParamSchema.parse(req.params);
    return reply.send(await service.getService(id));
  });
}
