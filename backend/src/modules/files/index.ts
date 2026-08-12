// Files module — signed public reads for the local storage driver.

import type { FastifyInstance } from "fastify";
import { fileRoutes } from "./routes/files.routes.js";

export default async function filesModule(app: FastifyInstance) {
  app.register(fileRoutes, { prefix: "/api/v3/files" });
}
