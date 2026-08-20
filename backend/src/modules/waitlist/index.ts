// Coming-soon waitlist sign-up — the single public capture form shown before launch.
//
// Public STRUCTURALLY, not by an allow-list: server.ts registers this module as a sibling of the
// encapsulated scope that authPlugin lives in, exactly as it does for blogModule/publicServicesModule.
// The auth hook is therefore never acquired, which cannot be got wrong by mistyping a path pattern.

import type { FastifyInstance } from "fastify";
import { waitlistRoutes } from "./routes/waitlist.routes.js";

export default async function waitlistModule(app: FastifyInstance) {
  app.register(waitlistRoutes, { prefix: "/api/v3/waitlist" });
}
