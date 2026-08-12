// Personal Home — aggregator only. No repositories, no migration, no tables.

import type { FastifyInstance } from "fastify";
import { personalHomeRoutes } from "./routes/personal-home.routes.js";

export default async function personalHomeModule(app: FastifyInstance) {
  app.register(personalHomeRoutes, { prefix: "/api/v3/personal-home" });
}
