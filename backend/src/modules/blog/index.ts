import type { FastifyInstance } from "fastify";
import { publicBlogRoutes } from "./routes/public-blog.routes.js";

export default async function blogModule(app: FastifyInstance) {
  app.register(publicBlogRoutes, { prefix: "/api/v3" });
}
