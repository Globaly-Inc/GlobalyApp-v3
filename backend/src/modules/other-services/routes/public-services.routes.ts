import type { FastifyInstance } from "fastify";
import { BrowseQuerySchema, ListingIdParamSchema } from "../schemas/services.schema.js";
import * as publicServices from "../services/public-services.service.js";

/**
 * The marketplace a buyer browses. Unauthenticated.
 *
 * Mounted on its own prefix rather than as public routes inside /my-services, so "is this endpoint public?"
 * is answered by which file a route is in, not by a pattern kept somewhere else.
 *
 * Every route in this file is marked public by the onRoute hook below, and auth.plugin.ts honours that flag
 * generically. Two consequences worth stating: a route added here is public the moment it is added, with
 * nothing to remember; and a route added to my-services.routes.ts is authenticated, also with nothing to
 * remember. The earlier approach — a path regex in the auth plugin — could be true of a GET and accidentally
 * true of a POST on the same path, which is precisely the hole that reached review.
 */
export async function publicServicesRoutes(app: FastifyInstance) {
  app.addHook("onRoute", (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, public: true };
  });

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
