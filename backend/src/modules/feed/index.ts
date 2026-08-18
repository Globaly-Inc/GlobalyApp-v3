// Feed module — cross-portal social feed. Consumed by the Personal Home, not owned by it.

import type { FastifyInstance } from "fastify";
import { feedRoutes } from "./routes/feed.routes.js";
import { feedCommentRoutes } from "./routes/feed-comments.routes.js";

export default async function feedModule(app: FastifyInstance) {
  app.register(feedRoutes, { prefix: "/api/v3/feed" });
  app.register(feedCommentRoutes, { prefix: "/api/v3/feed" });
}
