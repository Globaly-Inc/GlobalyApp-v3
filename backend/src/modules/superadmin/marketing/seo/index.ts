import type { FastifyInstance } from "fastify";
import { seoRoutes } from "./routes/seo.routes.js";

export default async function seoAdminModule(app: FastifyInstance) {
  app.register(seoRoutes);
}
