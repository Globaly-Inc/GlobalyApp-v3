import type { FastifyInstance } from "fastify";
import { publicScholarshipRoutes } from "./routes/public-scholarships.routes.js";
import { businessScholarshipRoutes } from "./routes/business-scholarships.routes.js";

export default async function scholarshipsPublicModule(app: FastifyInstance) {
  app.register(publicScholarshipRoutes, { prefix: "/api/v3" });
}

/**
 * Business-owned submission. Registered inside the server's protected scope —
 * unlike the public reads above, this needs auth and the tenant plugin to have
 * resolved req.business.
 */
export async function businessScholarshipsModule(app: FastifyInstance) {
  await app.register(businessScholarshipRoutes, { prefix: "/api/v3/business/scholarships" });
}
