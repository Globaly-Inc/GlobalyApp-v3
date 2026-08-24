// Ambassador program module — business-created affiliate programs, student applications, the
// ambassador roster that approval produces, and Connect onboarding. Actual payouts (Transfers)
// need an earnings ledger that doesn't exist yet — a later step.

import type { FastifyInstance } from "fastify";
import { programsRoutes } from "./routes/programs.routes.js";
import { applicationsRoutes } from "./routes/applications.routes.js";
import { connectRoutes } from "./routes/connect.routes.js";

export default async function ambassadorsModule(app: FastifyInstance) {
  app.register(programsRoutes, { prefix: "/api/v3/ambassadors" });
  app.register(applicationsRoutes, { prefix: "/api/v3/ambassadors" });
  app.register(connectRoutes, { prefix: "/api/v3/ambassadors" });
}
