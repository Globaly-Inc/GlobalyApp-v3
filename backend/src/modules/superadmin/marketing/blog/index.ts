// Blog sub-module — register routes with no prefix (parent sets it).

import type { FastifyInstance } from "fastify";
import { postRoutes } from "./routes/posts.routes.js";
import { keywordRoutes } from "./routes/keywords.routes.js";
import { generationRoutes } from "./routes/generation.routes.js";

export default async function blogModule(app: FastifyInstance) {
  app.register(postRoutes);
  app.register(keywordRoutes);
  app.register(generationRoutes);
}
