import type { FastifyInstance } from "fastify";
import { BrowseQuerySchema, ListingIdParamSchema } from "../schemas/services.schema.js";
import * as publicServices from "../services/public-services.service.js";

/**
 * The marketplace a buyer browses. Unauthenticated — see the `publicPatterns` entry in auth.plugin.ts.
 *
 * Mounted on its own prefix rather than as public routes inside /my-services, so "is this endpoint public?"
 * is answered by which file a route is in, not by reading a regex.
 */
export async function publicServicesRoutes(app: FastifyInstance) {
  /** The category filter, and the picker on the listing form. Rows, not an enum — admins manage these. */
  app.get("/categories", async (_req, reply) =>
    reply.send({ categories: await publicServices.categories() }),
  );

  app.get("/", async (req, reply) => {
    const query = BrowseQuerySchema.parse(req.query);
    return reply.send(await publicServices.browse(query));
  });

  app.get("/:serviceId", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    return reply.send(await publicServices.getOne(serviceId));
  });

  app.get("/:serviceId/reviews", async (req, reply) => {
    const { serviceId } = ListingIdParamSchema.parse(req.params);
    return reply.send({ reviews: await publicServices.reviews(serviceId) });
  });
}
