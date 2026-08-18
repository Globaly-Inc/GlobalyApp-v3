// Courses module — student-facing browse of extracted courses.

import type { FastifyInstance } from "fastify";
import { coursesRoutes } from "./routes/courses.routes.js";

export default async function coursesModule(app: FastifyInstance) {
  app.register(coursesRoutes, { prefix: "/api/v3" });
}
