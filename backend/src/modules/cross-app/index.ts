// Cross-app GlobalyAI feed (§3.4).
//
// Registered at the ROOT of the server, like billingModule's webhook scope: the
// callers are other services, so there is no JWT, no user and no tenant to resolve.
// Authentication is a per-direction pre-shared secret in a header — and BOTH secrets
// are absent in this environment, so both surfaces answer 503 rather than run open.
// See shared/sync-auth.ts.
//
// STILL AN OPEN QUESTION, and §3.4 says so explicitly: "confirm still needed before
// building — the external consumer may be obsolete". The endpoints are built to V1's
// contract and fail closed, so nothing is exposed until an operator sets the secrets.
// If GlobalyAI is confirmed dead, delete this module rather than leave it configured.

import type { FastifyInstance } from "fastify";

import { exportRoutes } from "./routes/export.routes.js";
import { ingestRoutes } from "./routes/ingest.routes.js";

const PREFIX = "/api/v3/cross-app";

export default async function crossAppModule(app: FastifyInstance) {
  await app.register(exportRoutes, { prefix: PREFIX });
  await app.register(ingestRoutes, { prefix: PREFIX });
}
