// Enquiries module — student-facing enquiry creation + lookup (Phase 4).
// Matching, distributions register here. Conversations/chat/wallet reverted for
// this scope-reduction pass — see plan doc for follow-up tenant-sync work.

import type { FastifyInstance } from "fastify";
import { enquiriesRoutes } from "./routes/enquiries.routes.js";
import { distributionsRoutes } from "./routes/distributions.routes.js";

export default async function enquiriesModule(app: FastifyInstance) {
  app.register(enquiriesRoutes, { prefix: "/api/v3" });
  app.register(distributionsRoutes, { prefix: "/api/v3" });
}
