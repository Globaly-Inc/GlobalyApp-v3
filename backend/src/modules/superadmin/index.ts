import type { FastifyInstance } from "fastify";
import adminUsersModule from "./admin-users/index.js";
import dataExtractionModule from "./data-extraction/index.js";

export default async function superadminModule(app: FastifyInstance) {
  app.register(adminUsersModule, { prefix: "/api/v3/admin" });
  app.register(dataExtractionModule, { prefix: "/api/v3/admin/data-extraction" });
}
