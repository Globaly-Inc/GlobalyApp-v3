import type { FastifyInstance } from "fastify";
import { requireSuperAdmin } from "./shared/require-super-admin.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { queueRoutes } from "./routes/queue.routes.js";
import { coursesRoutes } from "./routes/courses.routes.js";
import { stagedRoutes } from "./routes/staged.routes.js";
import { reviewRoutes } from "./routes/review.routes.js";
import { immigrationRoutes } from "./routes/immigration.routes.js";
import { supportingRoutes } from "./routes/supporting.routes.js";
import { promoteRoutes } from "./routes/promote.routes.js";
import { aggregatorRoutes } from "./routes/aggregator.routes.js";
import { agentcisRoutes } from "./routes/agentcis.routes.js";
import { servicesRoutes } from "./routes/services.routes.js";

export default async function dataExtractionModule(app: FastifyInstance) {
  // All extraction endpoints require super_admin role
  app.addHook("onRequest", requireSuperAdmin);

  app.register(jobsRoutes);
  app.register(queueRoutes);
  app.register(coursesRoutes);
  app.register(stagedRoutes);
  app.register(reviewRoutes);
  app.register(immigrationRoutes);
  app.register(supportingRoutes);
  app.register(promoteRoutes);
  app.register(aggregatorRoutes);
  app.register(agentcisRoutes);
  app.register(servicesRoutes);
}
