// The signed-in learner's training surface, under /api/v3/me/training inside the
// server's protected scope. The learner is always Number(req.auth.sub).

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  IdParamSchema,
  MarkProgressSchema,
  SubmitAssessmentSchema,
} from "../schemas/training.schema.js";
import * as learner from "../services/learner.service.js";

function userId(req: FastifyRequest): number {
  return Number(req.auth.sub);
}

export async function meTrainingRoutes(app: FastifyInstance) {
  app.get("/assignments", async (req, reply) =>
    reply.send(await learner.listAssignments(userId(req))),
  );

  app.get("/programs/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await learner.getProgram(userId(req), id));
  });

  app.get("/programs/:id/progress", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await learner.getProgress(userId(req), id));
  });

  // Correct answers are stripped here — see learner.service.getAssessment.
  app.get("/programs/:id/assessment", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await learner.getAssessment(userId(req), id));
  });

  app.post("/progress", async (req, reply) => {
    const { program_id, chapter_id } = MarkProgressSchema.parse(req.body);
    return reply.send(await learner.markProgress(userId(req), program_id, chapter_id));
  });

  // Graded server-side. The body carries the learner's choices only.
  app.post("/assessments/:id/submit", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const body = SubmitAssessmentSchema.parse(req.body);
    return reply.send(await learner.submitAssessment(userId(req), id, body));
  });

  app.get("/certificates", async (req, reply) =>
    reply.send(await learner.listCertificates(userId(req))),
  );

  app.get("/gamification", async (req, reply) =>
    reply.send(await learner.getGamification(userId(req))),
  );
}
