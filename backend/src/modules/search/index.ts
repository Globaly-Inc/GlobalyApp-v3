import type { FastifyInstance } from "fastify";
import { catalogRoutes } from "./routes/catalog.routes.js";
import { profileRoutes } from "./routes/profiles.routes.js";
import { searchBusinessesRoutes } from "./routes/businesses.routes.js";
import { searchCoursesRoutes } from "./routes/courses.routes.js";
import { studentJobsRoutes } from "./routes/student-jobs.routes.js";

export default async function searchModule(app: FastifyInstance) {
  app.register(searchBusinessesRoutes, { prefix: "/api/v3" });
  app.register(searchCoursesRoutes, { prefix: "/api/v3" });
  app.register(studentJobsRoutes, { prefix: "/api/v3" });
  // Public catalog over promoted/live tenant services (Wave C2). /search/courses
  // above still reads staged extraction rows — it is the pre-promote surface.
  app.register(catalogRoutes, { prefix: "/api/v3/catalog" });
  // Wave C2b: the public institution/agent profiles those service cards link to,
  // and the sitemap inventory behind the SEO pages.
  app.register(profileRoutes, { prefix: "/api/v3/catalog" });
}
