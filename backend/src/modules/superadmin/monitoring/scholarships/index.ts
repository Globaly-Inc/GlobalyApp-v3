// Scholarships sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { scholarshipRoutes } from "./routes/scholarships.routes.js";

export default async function scholarshipsModule(app: FastifyInstance) {
  app.register(scholarshipRoutes);
}
