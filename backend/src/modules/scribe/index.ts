// Scribe — counsellor session transcription, live coaching and the post-session
// review. Wave E3.
//
// One export, all of it behind business context: there is no public scribe
// surface and there must never be one. A transcript is a verbatim recording of a
// counselling conversation, held in the business's own tenant schema.

import type { FastifyInstance } from "fastify";
import { scribeRoutes } from "./routes/scribe.routes.js";

export default async function scribeModule(app: FastifyInstance) {
  await app.register(scribeRoutes, { prefix: "/api/v3/business/scribe" });
}
