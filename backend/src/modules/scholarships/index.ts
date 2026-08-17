import type { FastifyInstance } from "fastify";
import { publicScholarshipRoutes } from "./routes/public-scholarships.routes.js";

export default async function scholarshipsPublicModule(app: FastifyInstance) {
  app.register(publicScholarshipRoutes, { prefix: "/api/v3" });
}
