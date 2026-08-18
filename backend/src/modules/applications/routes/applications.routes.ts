// The student's own applications. Registered under /api/v3/applications.
//
// The student id is always req.auth.sub from the verified JWT, never a body field,
// so "list mine" cannot be turned into "list anyone's".

import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import { CreateApplicationSchema, MyApplicationsQuery } from "../schemas/applications.schema.js";
import * as service from "../services/applications.service.js";

function studentId(req: FastifyRequest): number {
  if (req.auth?.type !== "platform_user") {
    throw new ForbiddenError("Only a signed-in platform user can apply");
  }
  return Number(req.auth.sub);
}

export async function applicationsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = MyApplicationsQuery.parse(req.query);
    return reply.send(await service.listMine(studentId(req), query));
  });

  app.post("/", async (req, reply) => {
    const input = CreateApplicationSchema.parse(req.body);
    return reply.status(201).send(await service.submit(studentId(req), input));
  });
}
