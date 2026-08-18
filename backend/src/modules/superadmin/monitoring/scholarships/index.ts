// Scholarships sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { scholarshipRoutes } from "./routes/scholarships.routes.js";
import { scholarshipModerationRoutes } from "./routes/moderation.routes.js";

export default async function scholarshipsModule(app: FastifyInstance) {
  // Moderation first: its /stats and /:id/approve paths must be matched before
  // the CRUD router's /:id.
  app.register(scholarshipModerationRoutes);
  app.register(scholarshipRoutes);
}
