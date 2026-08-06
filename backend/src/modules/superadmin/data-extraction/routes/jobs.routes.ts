// Extraction jobs routes — maps V2 endpoints E1-E4, RJ1-RJ4, C9-C16.

import type { FastifyInstance } from "fastify";
import * as service from "../services/jobs.service.js";
import {
  CreateJobSchema,
  FailJobSchema,
  PatchJobContextSchema,
  MergeDuplicatesSchema,
  UuidParamSchema,
  JobIdParamSchema,
  ListJobsQuerySchema,
  FilteredJobsQuerySchema,
  JobEventsQuerySchema,
} from "../schemas/jobs.schema.js";

export async function jobsRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // ── Reads ──

  // RJ1: GET /jobs
  app.get("/jobs", async (req, reply) => {
    const query = ListJobsQuerySchema.parse(req.query);
    return reply.send(await service.listJobs(query));
  });

  // E2: GET /jobs-filtered
  app.get("/jobs-filtered", async (req, reply) => {
    const query = FilteredJobsQuerySchema.parse(req.query);
    const statuses = query.statuses?.split(",").filter(Boolean);
    return reply.send(
      await service.listJobsFiltered({
        statuses,
        sourceType: query.source_type,
        excludeSourceType: query.exclude_source_type,
        limit: query.limit,
      }),
    );
  });

  // RJ2: GET /jobs/:id
  app.get("/jobs/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.getJob(id));
  });

  // RJ3: GET /jobs/:id/events
  app.get("/jobs/:id/events", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { limit } = JobEventsQuerySchema.parse(req.query);
    return reply.send(await service.getJobEvents(id, limit));
  });

  // E1: GET /jobs/:id/agent-runs
  app.get("/jobs/:id/agent-runs", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.getAgentRuns(id));
  });

  // ── Creates ──

  // E3: POST /jobs
  app.post("/jobs", async (req, reply) => {
    const input = CreateJobSchema.parse(req.body);
    const result = await service.createJob(input, adminId(req));
    return reply.status(201).send(result);
  });

  // ── Status transitions ──

  // C11: POST /jobs/:id/pause
  app.post("/jobs/:id/pause", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.pauseJob(id, adminId(req)));
  });

  // C12: POST /jobs/:id/resume
  app.post("/jobs/:id/resume", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.resumeJob(id, adminId(req)));
  });

  // C10: POST /jobs/:id/decline
  app.post("/jobs/:id/decline", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.declineJob(id, adminId(req)));
  });

  // E4: POST /jobs/:id/fail
  app.post("/jobs/:id/fail", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = FailJobSchema.parse(req.body);
    return reply.send(await service.failJob(id, input, adminId(req)));
  });

  // C14: PATCH /jobs/:id/context
  app.patch("/jobs/:id/context", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchJobContextSchema.parse(req.body);
    return reply.send(await service.patchJobContext(id, input, adminId(req)));
  });

  // C13: DELETE /jobs/:id
  app.delete("/jobs/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteJob(id, adminId(req)));
  });

  // C16: POST /jobs/:id/merge-duplicates
  app.post("/jobs/:id/merge-duplicates", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { dry_run } = MergeDuplicatesSchema.parse(req.body);
    return reply.send(await service.mergeDuplicates(id, dry_run, adminId(req)));
  });

  // C15: POST /jobs/:jobId/courses — handled in courses.routes.ts
}
