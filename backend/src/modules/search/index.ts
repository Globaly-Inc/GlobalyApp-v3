import type { FastifyInstance } from "fastify";
import { searchBusinessesRoutes } from "./routes/businesses.routes.js";
import { searchCoursesRoutes } from "./routes/courses.routes.js";
import { studentJobsRoutes } from "./routes/student-jobs.routes.js";

export default async function searchModule(app: FastifyInstance) {
  app.register(searchBusinessesRoutes, { prefix: "/api/v3" });
  app.register(searchCoursesRoutes, { prefix: "/api/v3" });
  app.register(studentJobsRoutes, { prefix: "/api/v3" });
}
