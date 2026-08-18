// Ads module — campaigns, creatives, placements, serving, impressions, leads,
// dismissals, reports and admin moderation. Wave G5.
//
// Split by trust boundary, which is why there are two exports:
//
//   default (adsModule)   registered INSIDE the server's protected scope. Everything
//                         that spends the advertiser's money or reads their data.
//   publicAdsModule       registered at the ROOT. Serving only: an ad slot on a
//                         public page carries no JWT. Identity there is optional
//                         and used solely to hide dismissed campaigns.
//
// Same shape as events/index.ts (eventsModule + publicEventsModule).

import type { FastifyInstance } from "fastify";
import { adminAdsRoutes } from "./routes/admin-ads.routes.js";
import { adEngagementRoutes } from "./routes/engagement.routes.js";
import { businessAdsRoutes } from "./routes/business-ads.routes.js";
import { publicAdsRoutes } from "./routes/public-ads.routes.js";

export default async function adsModule(app: FastifyInstance) {
  await app.register(adEngagementRoutes, { prefix: "/api/v3/ads" });
  await app.register(businessAdsRoutes, { prefix: "/api/v3/business/ads" });
  await app.register(adminAdsRoutes, { prefix: "/api/v3/admin/marketing/ads" });
}

/** Public ad serving (no auth). Registered at the server root. */
export async function publicAdsModule(app: FastifyInstance) {
  await app.register(publicAdsRoutes, { prefix: "/api/v3" });
}
