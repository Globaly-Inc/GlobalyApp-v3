// /:jobId/apply is any authenticated platform user applying as themselves; the rest is the
// business reviewing applications to its own posting.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  ApplicationIdParamSchema, ApplyToJobSchema, JobIdParamSchema, ReviewApplicationSchema,
} from "../schemas/jobs.schema.js";
import * as service from "../services/applications.service.js";

export async function applicationsRoutes(app: FastifyInstance) {
  app.post("/jobs/:jobId/apply", async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    const input = ApplyToJobSchema.parse(req.body);
    const application = await service.apply(jobId, Number(req.auth.sub), input);
    return reply.status(201).send(application);
  });

  app.get("/jobs/:jobId/applications", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    const applications = await service.listForBusiness(jobId, req.businessId);
    return reply.send(applications);
  });

  app.post(
    "/jobs/:jobId/applications/:applicationId/review",
    { preHandler: requireBusinessContext },
    async (req, reply) => {
      const { jobId, applicationId } = ApplicationIdParamSchema.parse(req.params);
      const input = ReviewApplicationSchema.parse(req.body);
      const application = await service.review(jobId, applicationId, req.businessId, input);
      return reply.send(application);
    },
  );
}
