// Scholarships sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { bulkDeleteRoutes } from "./routes/bulk-delete.routes.js";
import { importRoutes } from "./routes/import.routes.js";
import { scholarshipRoutes } from "./routes/scholarships.routes.js";

export default async function scholarshipsModule(app: FastifyInstance) {
  app.register(importRoutes);
  app.register(bulkDeleteRoutes);
  app.register(scholarshipRoutes);
}
