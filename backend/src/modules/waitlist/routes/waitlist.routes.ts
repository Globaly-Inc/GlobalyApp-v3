// Prefix: /api/v3 — the PUBLIC waitlist sign-up. No JWT, no identity.
//
// POST-ONLY BY DESIGN. There is no GET here and there must never be: the table is
// pure PII and this router sits outside the server's authenticated scope, so any
// read added here would be world-readable. The admin listing lives in
// admin-waitlist.routes.ts, inside the protected scope, behind requireAdmin.

import type { FastifyInstance } from "fastify";

import * as service from "../services/waitlist.service.js";
import { RegisterWaitlistSchema } from "../schemas/waitlist.schema.js";

export async function publicWaitlistRoutes(app: FastifyInstance) {
  app.post(
    "/waitlist",
    {
      // Anonymous write endpoint: tighter than the global 100/min so a script cannot
      // farm the unique-email response bit or fill the table. Same shape as the
      // public certificate-verification and business-registration limits.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const body = RegisterWaitlistSchema.parse(req.body ?? {});
      return reply.send(await service.register(body));
    },
  );
}
