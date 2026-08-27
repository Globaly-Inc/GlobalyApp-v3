import type { FastifyInstance } from "fastify";
import { guidesRoutes } from "./routes/guides.routes.js";

// Admin CRUD for marketing guides — registered under /api/v3/admin/marketing/guides (see
// superadmin/index.ts), which already applies requireAdmin at the scope level.
export default async function guidesAdminModule(app: FastifyInstance) {
  app.register(guidesRoutes);
}
