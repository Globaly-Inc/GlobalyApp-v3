// Applications module — student applications to a business service, the credit
// charge that fires when one is accepted, and admin waive/refund. Wave G5.
//
// NOT job applications: `student_job_applications` (Wave G2) is a student applying
// to a job posting. This is a student applying to a service offered by a business
// or institution — the row V1's `charge-application` bills the business for. See
// 20260817_802's header.
//
// Everything here needs auth, so the whole module registers inside the server's
// protected scope. There is no public projection of a charge anywhere: every row
// carries the applicant's identity.

import type { FastifyInstance } from "fastify";
import { adminChargesRoutes } from "./routes/admin-charges.routes.js";
import { applicationsRoutes } from "./routes/applications.routes.js";
import {
  businessApplicationsRoutes,
  businessChargesRoutes,
} from "./routes/business-applications.routes.js";

export default async function applicationsModule(app: FastifyInstance) {
  await app.register(applicationsRoutes, { prefix: "/api/v3/applications" });
  await app.register(businessApplicationsRoutes, { prefix: "/api/v3/business/applications" });
  await app.register(businessChargesRoutes, { prefix: "/api/v3/business/application-charges" });
  await app.register(adminChargesRoutes, { prefix: "/api/v3/admin/revenue/application-charges" });
}
