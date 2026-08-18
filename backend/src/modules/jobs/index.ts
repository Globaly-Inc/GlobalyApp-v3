// Jobs board — posting, the applicant pipeline, AI assist, and admin oversight.
// Wave G2.
//
// Registered inside the server's protected scope: every route here needs auth, and
// the business surface additionally needs the tenant plugin to have resolved
// req.business.
//
// The public read side of the board is NOT here — it is the pre-existing
// modules/search/routes/student-jobs.routes.ts (GET /api/v3/students/jobs), which
// this wave left in place and updated for the status/closing_at reshape.

import type { FastifyInstance } from "fastify";
import { adminJobsRoutes } from "./routes/admin-jobs.routes.js";
import { businessJobsRoutes } from "./routes/business-jobs.routes.js";
import { studentJobsRoutes } from "./routes/student-jobs.routes.js";

export default async function jobsModule(app: FastifyInstance) {
  await app.register(businessJobsRoutes, { prefix: "/api/v3/business/jobs" });
  await app.register(studentJobsRoutes, { prefix: "/api/v3/jobs" });
  await app.register(adminJobsRoutes, { prefix: "/api/v3/admin/monitoring/jobs" });
}
