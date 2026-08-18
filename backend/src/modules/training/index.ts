// Training module — programs, chapters, assessments, enrolment, progress,
// verifiable certificates and XP/streak gamification. Wave G4.
//
// Two exports: the default goes inside the server's protected scope; the public
// certificate verifier is registered at the root, next to blog/public services,
// because a verification code must work without an account.

import type { FastifyInstance } from "fastify";
import { adminTrainingRoutes } from "./routes/admin-training.routes.js";
import { businessTrainingRoutes } from "./routes/business-training.routes.js";
import { meTrainingRoutes } from "./routes/me-training.routes.js";
import { publicCertificateRoutes } from "./routes/public-certificates.routes.js";

export default async function trainingModule(app: FastifyInstance) {
  await app.register(meTrainingRoutes, { prefix: "/api/v3/me/training" });
  await app.register(businessTrainingRoutes, { prefix: "/api/v3/business/training" });
  await app.register(adminTrainingRoutes, { prefix: "/api/v3/admin/monitoring/training" });
}

export async function publicCertificatesModule(app: FastifyInstance) {
  await app.register(publicCertificateRoutes, { prefix: "/api/v3/certificates" });
}
