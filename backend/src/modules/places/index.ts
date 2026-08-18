// Places module — Google Places autocomplete/details for self-service profile forms.

import type { FastifyInstance } from "fastify";
import { placesRoutes } from "./routes/places.routes.js";

export default async function placesModule(app: FastifyInstance) {
  app.register(placesRoutes, { prefix: "/api/v3/places" });
}
