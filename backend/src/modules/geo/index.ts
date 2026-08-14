import type { FastifyInstance } from "fastify";
import { publicGeoRoutes } from "./routes/public-geo.routes.js";

export default async function geoModule(app: FastifyInstance) {
  app.register(publicGeoRoutes, { prefix: "/api/v3" });
}
