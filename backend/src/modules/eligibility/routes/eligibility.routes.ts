// Prefix: /api/v3/eligibility — the signed-in person's own eligibility checks.
// The owner is req.auth.sub on every route; no route accepts a user id, and there
// is no route that reads another student's checks.

import type { FastifyInstance } from "fastify";

import { ListChecksQuerySchema, RunCheckSchema } from "../schemas/eligibility.schema.js";
import * as service from "../services/eligibility.service.js";

export async function eligibilityRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    // No `?? {}`: fastify always supplies an object for the querystring. The body
    // below does need it — a POST with no body at all arrives as null.
    const query = ListChecksQuerySchema.parse(req.query);
    return reply.send(await service.list(Number(req.auth.sub), query));
  });

  app.post("/", async (req, reply) => {
    const body = RunCheckSchema.parse(req.body ?? {});
    return reply.status(201).send(await service.run(Number(req.auth.sub), body));
  });
}
