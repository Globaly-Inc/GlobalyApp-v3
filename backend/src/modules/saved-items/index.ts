// Saved items module — a signed-in user's shortlist of courses and institutions.

import type { FastifyInstance } from "fastify";
import { savedItemsRoutes } from "./routes/saved-items.routes.js";

export default async function savedItemsModule(app: FastifyInstance) {
  app.register(savedItemsRoutes, { prefix: "/api/v3" });
}
