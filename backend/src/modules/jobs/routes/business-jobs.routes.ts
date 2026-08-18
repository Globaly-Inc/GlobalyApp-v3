// Business-side posting and applicant review. Registered under
// /api/v3/business/jobs behind requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — and never from a path or body. Every service call takes it, and
// every repository write puts it in the WHERE, so business B reading or moving
// business A's rows is a 404 (not a 403, which would confirm the row exists).

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  ApplicationIdParam,
  ApplicationsQuery,
  BusinessJobsQuery,
  CreateJobSchema,
  JobIdParam,
  UpdateApplicationSchema,
  UpdateJobSchema,
} from "../schemas/jobs.schema.js";
import * as applications from "../services/applications.service.js";
import * as jobs from "../services/jobs.service.js";

/**
 * BusinessRecord.id is declared string in core/types.ts but the column is a
 * serial — Number() is the narrowing, not a cast that could lie. Same precedent
 * as billing/routes/context.ts and the enquiries inbox.
 */
function businessId(req: { business?: { id: string | number } }): number {
  return Number(req.business!.id);
}

export async function businessJobsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const query = BusinessJobsQuery.parse(req.query);
    return reply.send(await jobs.listOwn(businessId(req), query));
  });

  app.post("/", async (req, reply) => {
    const body = CreateJobSchema.parse(req.body);
    const created = await jobs.create(businessId(req), Number(req.auth.sub), body);
    return reply.status(201).send(created);
  });

  app.get("/:jobId", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    return reply.send(await jobs.getOwn(jobId, businessId(req)));
  });

  app.patch("/:jobId", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    const body = UpdateJobSchema.parse(req.body);
    return reply.send(await jobs.update(jobId, businessId(req), body));
  });

  app.post("/:jobId/publish", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    return reply.send(await jobs.publish(jobId, businessId(req)));
  });

  app.post("/:jobId/close", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    return reply.send(await jobs.close(jobId, businessId(req)));
  });

  app.delete("/:jobId", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    await jobs.remove(jobId, businessId(req));
    return reply.status(204).send();
  });

  app.get("/:jobId/applications", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    const query = ApplicationsQuery.parse(req.query);
    return reply.send(await applications.listForJob(jobId, businessId(req), query));
  });

  app.patch("/:jobId/applications/:applicationId", async (req, reply) => {
    const { jobId, applicationId } = ApplicationIdParam.parse(req.params);
    const body = UpdateApplicationSchema.parse(req.body);
    return reply.send(
      await applications.updateStage(
        jobId,
        applicationId,
        businessId(req),
        Number(req.auth.sub),
        body,
      ),
    );
  });
}
