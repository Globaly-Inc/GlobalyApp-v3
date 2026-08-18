// Business-owner training management, under /api/v3/business/training behind
// requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — never from the path or body.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  AssignSchema,
  CreateTrainingProgramSchema,
  ListProgramsQuerySchema,
  ProgramIdParamSchema,
  PutAssessmentSchema,
  PutChaptersSchema,
  UpdateTrainingProgramSchema,
} from "../schemas/training.schema.js";
import {
  ApplicationIdParamSchema,
  ChapterIdParamSchema,
  GradeSubmissionSchema,
  InvitationIdParamSchema,
  InviteSchema,
  ListApplicationsQuerySchema,
  ListInvitationsQuerySchema,
  ListSubmissionsQuerySchema,
  PutChapterAttachmentsSchema,
  RejectApplicationSchema,
  SubmissionIdParamSchema,
} from "../schemas/lms.schema.js";
import * as service from "../services/business-training.service.js";
import * as lms from "../services/lms-business.service.js";

function businessId(req: FastifyRequest): number {
  return Number(req.business!.id);
}

export async function businessTrainingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/stats", async (req, reply) => reply.send(await service.stats(businessId(req))));
  app.get("/leaderboard", async (req, reply) =>
    reply.send(await service.leaderboard(businessId(req))),
  );

  app.get("/programs", async (req, reply) => {
    const query = ListProgramsQuerySchema.parse(req.query);
    return reply.send(await service.listPrograms(businessId(req), query));
  });

  app.post("/programs", async (req, reply) => {
    const body = CreateTrainingProgramSchema.parse(req.body);
    return reply
      .code(201)
      .send(await service.createProgram(businessId(req), Number(req.auth.sub), body));
  });

  app.get("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.getProgram(businessId(req), programId));
  });

  app.patch("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const body = UpdateTrainingProgramSchema.parse(req.body);
    return reply.send(await service.updateProgram(businessId(req), programId, body));
  });

  app.delete("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.deleteProgram(businessId(req), programId));
  });

  app.get("/programs/:programId/chapters", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.listChapters(businessId(req), programId));
  });

  app.put("/programs/:programId/chapters", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const { chapters } = PutChaptersSchema.parse(req.body);
    return reply.send(await service.putChapters(businessId(req), programId, chapters));
  });

  app.get("/programs/:programId/assessment", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.getAssessment(businessId(req), programId));
  });

  app.put("/programs/:programId/assessment", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const body = PutAssessmentSchema.parse(req.body);
    return reply.send(await service.putAssessment(businessId(req), programId, body));
  });

  app.get("/programs/:programId/assignments", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.listAssignments(businessId(req), programId));
  });

  app.post("/programs/:programId/assignments", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const body = AssignSchema.parse(req.body);
    return reply
      .code(201)
      .send(await service.assign(businessId(req), programId, Number(req.auth.sub), body));
  });

  app.get("/programs/:programId/roster", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await service.getRoster(businessId(req), programId));
  });

  // ── LMS delivery (Wave E4) ──────────────────────────────────────────────
  //
  // The lesson task definition. Its own route, not part of the chapter-list PUT,
  // so reordering chapters can never blank an assignment brief. V2 had neither.

  app.get("/programs/:programId/chapters/:chapterId/attachments", async (req, reply) => {
    const { programId, chapterId } = ChapterIdParamSchema.parse(req.params);
    return reply.send(await lms.getChapterAttachments(businessId(req), programId, chapterId));
  });

  app.put("/programs/:programId/chapters/:chapterId/attachments", async (req, reply) => {
    const { programId, chapterId } = ChapterIdParamSchema.parse(req.params);
    const { attachments } = PutChapterAttachmentsSchema.parse(req.body);
    return reply.send(
      await lms.putChapterAttachments(businessId(req), programId, chapterId, attachments),
    );
  });

  // The grading queue. Paginated — V2's had no LIMIT.
  app.get("/programs/:programId/submissions", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const query = ListSubmissionsQuerySchema.parse(req.query);
    return reply.send(await lms.listSubmissions(businessId(req), programId, query));
  });

  app.post("/programs/:programId/submissions/:submissionId/grade", async (req, reply) => {
    const { programId, submissionId } = SubmissionIdParamSchema.parse(req.params);
    const body = GradeSubmissionSchema.parse(req.body);
    return reply.send(
      await lms.gradeSubmission(
        businessId(req),
        programId,
        submissionId,
        Number(req.auth.sub),
        body,
      ),
    );
  });

  // Enrolment applications.
  app.get("/programs/:programId/enrollment-applications", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const query = ListApplicationsQuerySchema.parse(req.query);
    return reply.send(await lms.listApplications(businessId(req), programId, query));
  });

  app.get("/programs/:programId/enrollment-applications/counts", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await lms.applicationCounts(businessId(req), programId));
  });

  app.post(
    "/programs/:programId/enrollment-applications/:applicationId/approve",
    async (req, reply) => {
      const { programId, applicationId } = ApplicationIdParamSchema.parse(req.params);
      return reply.send(
        await lms.approveApplication(
          businessId(req),
          programId,
          applicationId,
          Number(req.auth.sub),
        ),
      );
    },
  );

  app.post(
    "/programs/:programId/enrollment-applications/:applicationId/reject",
    async (req, reply) => {
      const { programId, applicationId } = ApplicationIdParamSchema.parse(req.params);
      const { rejection_reason } = RejectApplicationSchema.parse(req.body);
      return reply.send(
        await lms.rejectApplication(
          businessId(req),
          programId,
          applicationId,
          Number(req.auth.sub),
          rejection_reason,
        ),
      );
    },
  );

  // Invitations. The token is never in a response.
  app.get("/programs/:programId/invitations", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const query = ListInvitationsQuerySchema.parse(req.query);
    return reply.send(await lms.listInvitations(businessId(req), programId, query));
  });

  app.post("/programs/:programId/invitations", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const { emails } = InviteSchema.parse(req.body);
    return reply
      .code(201)
      .send(await lms.invite(businessId(req), programId, Number(req.auth.sub), emails));
  });

  app.delete("/programs/:programId/invitations/:invitationId", async (req, reply) => {
    const { programId, invitationId } = InvitationIdParamSchema.parse(req.params);
    return reply.send(await lms.revokeInvitation(businessId(req), programId, invitationId));
  });
}
