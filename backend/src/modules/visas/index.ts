// Visas / MARA public directory (Wave G1).
//
// Registered OUTSIDE the authenticated scope in server.ts: V1 served both
// directories to anonymous visitors through SECURITY DEFINER RPCs and V2 kept
// them anonymous, so a token must never be required here.
//
// There is no authenticated half. Staging, review and promotion of visa and MARA
// rows already live in superadmin/data-extraction (admin-only); this module is
// the read side of the live catalog only.

import type { FastifyInstance } from "fastify";

import { maraAgentsRoutes } from "./routes/mara-agents.routes.js";
import { visasRoutes } from "./routes/visas.routes.js";

export async function publicVisasModule(app: FastifyInstance) {
  await app.register(visasRoutes, { prefix: "/api/v3/visas" });
  await app.register(maraAgentsRoutes, { prefix: "/api/v3/migration-agents" });
}

export default publicVisasModule;
