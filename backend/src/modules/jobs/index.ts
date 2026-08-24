// Jobs module — business-side posting management + applications. Reuses the `student_jobs` table
// that the search module already reads publicly from; this module is what writes to it.

import type { FastifyInstance } from "fastify";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { applicationsRoutes } from "./routes/applications.routes.js";

export default async function jobsModule(app: FastifyInstance) {
  app.register(jobsRoutes, { prefix: "/api/v3/jobs" });
  app.register(applicationsRoutes, { prefix: "/api/v3/jobs" });
}
