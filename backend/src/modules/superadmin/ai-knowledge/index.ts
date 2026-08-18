import type { FastifyInstance } from "fastify";
// Same guard the extraction module uses — AI Knowledge is curated by the same roles.
import { requireSuperAdmin } from "../data-extraction/shared/require-super-admin.js";
import { contentRoutes } from "./routes/content.routes.js";
import { rackRoutes } from "./routes/rack.routes.js";
import { retrievalRoutes } from "./routes/retrieval.routes.js";

export default async function aiKnowledgeModule(app: FastifyInstance) {
  app.addHook("onRequest", requireSuperAdmin);

  app.register(contentRoutes);
  app.register(rackRoutes);
  app.register(retrievalRoutes);
}
