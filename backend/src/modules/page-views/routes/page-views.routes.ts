import type { FastifyInstance } from "fastify";
import { PageViewParamSchema } from "../schemas/page-views.schema.js";
import * as repo from "../repositories/page-views.repository.js";

/**
 * Unauthenticated: the counter exists to be bumped by anonymous visitors.
 *
 * ponytail: nothing stops a script from bumping it in a loop. This is a vanity number on a public
 * page, not a metric anything is decided on — if it ever needs to be honest, rate-limit by IP hash
 * the way guest_sessions already does.
 */
export async function pageViewsRoutes(app: FastifyInstance) {
  /** Records the visit and returns the new total, so the page needs no second request to display it. */
  app.post("/page-views/:entityType/:entityId", async (req, reply) => {
    const { entityType, entityId } = PageViewParamSchema.parse(req.params);
    return reply.send({ views: await repo.bumpViews(entityType, entityId) });
  });
}
