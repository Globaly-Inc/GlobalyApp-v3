// Public institution claim routes — token-based, no auth. Both paths are listed in
// core/plugins/auth.plugin.ts publicPaths.

import type { FastifyInstance } from "fastify";
import { ClaimAcceptSchema, ClaimRequestByEmailSchema } from "../../businesses/schemas/businesses.schema.js";
import * as service from "../services/institution-claim.service.js";

export async function institutionClaimRoutes(app: FastifyInstance) {
  app.post("/claim/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, first_name, last_name } = ClaimAcceptSchema.parse(req.body);
    return reply.send(await service.acceptInstitutionClaim(token, { first_name, last_name }));
  });

  app.post("/claim/request", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const { email } = ClaimRequestByEmailSchema.parse(req.body);
    await service.requestInstitutionClaim(email);
    return reply.send({ message: "If an institution profile matches, we've sent a claim link to that email." });
  });
}
