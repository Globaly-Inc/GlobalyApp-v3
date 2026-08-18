// Student-side of the board: applying, "my applications", and the two AI helpers.
// Registered under /api/v3/jobs inside the server's protected scope.
//
// The applicant is always req.auth.sub. Nothing here reads a user id from the
// body, so one student cannot apply as — or read the applications of — another.

import type { FastifyInstance } from "fastify";
import { PaginationSchema } from "../../../shared/pagination.js";
import { AiAssistSchema, ApplySchema, JobIdParam } from "../schemas/jobs.schema.js";
import * as applications from "../services/applications.service.js";
import * as ai from "../services/job-ai.service.js";

export async function studentJobsRoutes(app: FastifyInstance) {
  /** Lets the UI hide the assist buttons instead of offering a guaranteed 503. */
  app.get("/ai/available", async (_req, reply) => reply.send({ available: ai.isConfigured() }));

  // Static before dynamic: /jobs/my-applications must not be read as a jobId.
  app.get("/my-applications", async (req, reply) => {
    const query = PaginationSchema.parse(req.query);
    return reply.send(await applications.listMine(Number(req.auth.sub), query));
  });

  app.post("/:jobId/applications", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    const body = ApplySchema.parse(req.body);
    const created = await applications.apply(jobId, Number(req.auth.sub), body);
    return reply.status(201).send(created);
  });

  // V1 job-ai-assist. Validation runs first, the provider check last — a bad
  // `type` is a 400 whether or not a key exists.
  app.post("/ai-assist", async (req, reply) => {
    const body = AiAssistSchema.parse(req.body);
    return reply.send(await ai.assist(body));
  });

  // V1 job-match-score, minus the fabricated fallback. 503 when unconfigured.
  app.post("/:jobId/match-score", async (req, reply) => {
    const { jobId } = JobIdParam.parse(req.params);
    return reply.send(await ai.matchScore(jobId, Number(req.auth.sub)));
  });
}
