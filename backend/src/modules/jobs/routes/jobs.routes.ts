import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { CreateJobSchema, JobIdParamSchema, UpdateJobSchema } from "../schemas/jobs.schema.js";
import * as service from "../services/jobs.service.js";

export async function jobsRoutes(app: FastifyInstance) {
  app.get("/jobs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const jobs = await service.list(req.businessId);
    return reply.send(jobs);
  });

  app.post("/jobs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = CreateJobSchema.parse(req.body);
    const job = await service.create(req.businessId, input);
    return reply.status(201).send(job);
  });

  app.get("/jobs/:jobId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    const job = await service.getOne(jobId, req.businessId);
    return reply.send(job);
  });

  app.patch("/jobs/:jobId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    const input = UpdateJobSchema.parse(req.body);
    const job = await service.update(jobId, req.businessId, input);
    return reply.send(job);
  });

  app.delete("/jobs/:jobId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    await service.remove(jobId, req.businessId);
    return reply.status(204).send();
  });
}
