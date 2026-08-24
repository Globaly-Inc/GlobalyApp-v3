// Ads module — business ad campaign management. Impression/click recording exists in the service
// layer (campaigns.service.ts) for whatever surface eventually renders ads to call; no such surface
// exists yet, so no route calls it yet either — that wiring is a separate, later decision.

import type { FastifyInstance } from "fastify";
import { campaignsRoutes } from "./routes/campaigns.routes.js";

export default async function adsModule(app: FastifyInstance) {
  app.register(campaignsRoutes, { prefix: "/api/v3/ads" });
}
