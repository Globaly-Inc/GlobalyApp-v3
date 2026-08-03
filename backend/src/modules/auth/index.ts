import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes.js";

export default async function authModule(app: FastifyInstance) {
  app.register(authRoutes, { prefix: "/api/v3/auth" });
}
