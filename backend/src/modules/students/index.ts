// Student module — registration, profile, qualifications, tests, work experience.

import type { FastifyInstance } from "fastify";
import { studentRoutes } from "./routes/students.routes.js";

export default async function studentsModule(app: FastifyInstance) {
  app.register(studentRoutes, { prefix: "/api/v3/students" });
}
