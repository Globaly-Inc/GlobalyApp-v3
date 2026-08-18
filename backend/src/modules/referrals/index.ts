// Referral program module.
//
// Split in two, exactly as other-services splits its public marketplace: the authenticated routes and
// the public ones are separate registrations so nothing is accidentally exposed by editing a path
// pattern. Here the public routes additionally carry `config: { public: true }`, which the auth hook
// honours generically — see auth.plugin.ts.

import type { FastifyInstance } from "fastify";
import { referralsRoutes } from "./routes/referrals.routes.js";
import { publicReferralsRoutes } from "./routes/public-referrals.routes.js";

export default async function referralsModule(app: FastifyInstance) {
  app.register(referralsRoutes, { prefix: "/api/v3/referrals" });
}

/** Unauthenticated: reward config and the /join code lookup. */
export async function publicReferralsModule(app: FastifyInstance) {
  app.register(publicReferralsRoutes, { prefix: "/api/v3/referrals" });
}
