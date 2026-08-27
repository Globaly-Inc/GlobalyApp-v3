import type { FastifyInstance } from "fastify";
import * as repo from "../repositories/tests.repository.js";

/**
 * The platform test catalogue, read side.
 *
 * Public because the course detail page renders test logos for signed-out visitors; the personal
 * portal's profile dialogs read the same endpoint rather than a second authenticated copy.
 */
export async function searchTestsRoutes(app: FastifyInstance) {
  app.get("/search/tests", async (_req, reply) => {
    return reply.send(await repo.listActiveTests());
  });
}
