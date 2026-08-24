// /programs/:programId/apply is any authenticated platform user applying as themselves — no
// business context required, since the applicant isn't acting on behalf of a business.
// Everything else here is the business reviewing applications to its own program.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  ApplicationIdParamSchema, ApplyToProgramSchema, ProgramIdParamSchema, ReviewApplicationSchema,
} from "../schemas/ambassadors.schema.js";
import * as service from "../services/applications.service.js";

export async function applicationsRoutes(app: FastifyInstance) {
  app.post("/programs/:programId/apply", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const { note } = ApplyToProgramSchema.parse(req.body);
    const application = await service.apply(programId, Number(req.auth.sub), note);
    return reply.status(201).send(application);
  });

  app.get("/programs/:programId/applications", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const applications = await service.listForProgram(programId, req.businessId);
    return reply.send(applications);
  });

  app.post(
    "/programs/:programId/applications/:applicationId/review",
    { preHandler: requireBusinessContext },
    async (req, reply) => {
      const { programId, applicationId } = ApplicationIdParamSchema.parse(req.params);
      const input = ReviewApplicationSchema.parse(req.body);
      const result = await service.review(programId, applicationId, req.businessId, Number(req.auth.sub), input);
      return reply.send(result);
    },
  );
}
