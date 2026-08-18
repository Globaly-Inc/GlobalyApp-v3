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
import * as service from "../services/business-training.service.js";

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
}
