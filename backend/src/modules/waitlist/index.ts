// Waitlist module — V2's waitlist.ts.
//
// Two exports because the surface straddles two authentication regimes, the same
// split events and scholarships use:
//
//   publicWaitlistModule — anonymous POST sign-up. Register at the server root.
//   adminWaitlistModule  — the listing. Register INSIDE the protected scope; it is
//                          the only read of a pure-PII table that exists.
//
// Keeping them as separate exports is what makes the "no anonymous read" property
// structural rather than a convention: the public router has no GET to forget to
// guard, and the admin router cannot be reached without the auth plugin.

import type { FastifyInstance } from "fastify";

import { publicWaitlistRoutes } from "./routes/waitlist.routes.js";
import { adminWaitlistRoutes } from "./routes/admin-waitlist.routes.js";

export async function publicWaitlistModule(app: FastifyInstance) {
  await app.register(publicWaitlistRoutes, { prefix: "/api/v3" });
}

export async function adminWaitlistModule(app: FastifyInstance) {
  await app.register(adminWaitlistRoutes, { prefix: "/api/v3/admin/waitlist" });
}
