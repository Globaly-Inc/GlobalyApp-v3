// Self-service institution profile routes — institution context required.
// The institution twin of businesses' GET/PATCH /businesses/me.

import type { FastifyInstance } from "fastify";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { InstitutionProfilePatchSchema } from "../schemas/institution-profile.schema.js";
import * as service from "../services/institution-profile.service.js";

export async function institutionProfileRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.getMyInstitution(req.institution!);
    return reply.send(result);
  });

  app.patch("/me", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const data = InstitutionProfilePatchSchema.parse(req.body);
    const result = await service.updateMyInstitution(req.institutionId, data);
    return reply.send(result);
  });
}
