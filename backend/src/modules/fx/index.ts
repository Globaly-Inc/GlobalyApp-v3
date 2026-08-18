// FX rates cache (§3.6). Public read, no auth — the search page needs it to quote
// a course fee in the visitor's currency, and there is nothing tenant-specific in a
// published exchange rate.

import type { FastifyInstance } from "fastify";

import { fxRoutes } from "./routes/fx.routes.js";

export default async function fxModule(app: FastifyInstance) {
  await app.register(fxRoutes, { prefix: "/api/v3" });
}
