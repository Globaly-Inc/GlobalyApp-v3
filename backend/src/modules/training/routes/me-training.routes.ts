// The signed-in learner's training surface, under /api/v3/me/training inside the
// server's protected scope. The learner is always Number(req.auth.sub).

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  IdParamSchema,
  MarkProgressSchema,
  SubmitAssessmentSchema,
} from "../schemas/training.schema.js";
import {
  ApplyForEnrolmentSchema,
  ChapterIdParamSchema,
  EnrolSchema,
  SubmitAssignmentSchema,
  SubmitQuizSchema,
} from "../schemas/lms.schema.js";
import * as learner from "../services/learner.service.js";
import * as lms from "../services/lms-learner.service.js";

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

  // ── LMS delivery (Wave E4) ──────────────────────────────────────────────

  app.post("/enroll", async (req, reply) => {
    const { program_id } = EnrolSchema.parse(req.body);
    return reply.send(await lms.enrol(userId(req), program_id));
  });

  app.post("/enrollment-applications", async (req, reply) => {
    const body = ApplyForEnrolmentSchema.parse(req.body);
    return reply.code(201).send(await lms.applyForEnrolment(userId(req), body));
  });

  // Handing in a lesson task does NOT complete the lesson — only a pass does.
  app.post("/assignment-submissions", async (req, reply) => {
    const body = SubmitAssignmentSchema.parse(req.body);
    return reply.code(201).send(await lms.submitAssignment(userId(req), body));
  });

  app.get("/programs/:id/assignment-submissions", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await lms.listOwnSubmissions(userId(req), id));
  });

  // Correct answers are stripped, the same way the final assessment strips them.
  app.get("/programs/:programId/chapters/:chapterId/quiz", async (req, reply) => {
    const { programId, chapterId } = ChapterIdParamSchema.parse(req.params);
    return reply.send(await lms.getChapterQuiz(userId(req), programId, chapterId));
  });

  // Graded server-side. The body carries the learner's choices only — V2 accepted
  // `score` and `passed` from the client and wrote them verbatim.
  app.post("/quiz-submissions", async (req, reply) => {
    const body = SubmitQuizSchema.parse(req.body);
    return reply.code(201).send(await lms.submitQuiz(userId(req), body));
  });

  app.get("/programs/:id/quiz-submissions", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await lms.listOwnQuizSubmissions(userId(req), id));
  });
}
