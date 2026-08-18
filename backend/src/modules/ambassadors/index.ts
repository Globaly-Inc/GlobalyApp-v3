// Ambassadors module — programs, applications, roster, inquiry engagement,
// chat, earnings and Stripe Connect payouts. Wave G4.
//
// Two exports because the public profile/program reads must NOT sit behind the
// auth plugin: the default export goes inside the server's protected scope, and
// `publicAmbassadorsModule` is registered at the root next to blog/public
// services.

import type { FastifyInstance } from "fastify";
import { adminAmbassadorRoutes } from "./routes/admin-ambassadors.routes.js";
import { businessAmbassadorRoutes } from "./routes/business-ambassadors.routes.js";
import { meAmbassadorRoutes } from "./routes/me-ambassador.routes.js";
import { publicAmbassadorRoutes } from "./routes/public-ambassadors.routes.js";

export default async function ambassadorsModule(app: FastifyInstance) {
  await app.register(meAmbassadorRoutes, { prefix: "/api/v3/me/ambassador" });
  await app.register(businessAmbassadorRoutes, { prefix: "/api/v3/business/ambassadors" });
  await app.register(adminAmbassadorRoutes, {
    prefix: "/api/v3/admin/monitoring/ambassador-programs",
  });
}

export async function publicAmbassadorsModule(app: FastifyInstance) {
  await app.register(publicAmbassadorRoutes, { prefix: "/api/v3/ambassadors" });
}
