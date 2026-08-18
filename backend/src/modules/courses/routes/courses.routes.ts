// Courses routes — read-only browse for the student portal.
// Any authenticated platform user can list courses; no extra preHandler, same
// as enquiries.routes.ts (the global JWT hook in auth.plugin.ts is the gate).

import type { FastifyInstance } from "fastify";
import * as service from "../services/courses.service.js";
import { ListCoursesQuerySchema } from "../schemas/courses.schema.js";

export async function coursesRoutes(app: FastifyInstance) {
  app.get("/courses", async (req, reply) => {
    const pagination = ListCoursesQuerySchema.parse(req.query);
    const result = await service.listCourses(pagination);
    return reply.send(result);
  });
}
