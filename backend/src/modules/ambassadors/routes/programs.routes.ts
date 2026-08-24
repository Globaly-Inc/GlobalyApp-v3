// Business-context: create/list/update ambassador programs.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { CreateProgramSchema, ProgramIdParamSchema, UpdateProgramSchema } from "../schemas/ambassadors.schema.js";
import * as service from "../services/programs.service.js";

export async function programsRoutes(app: FastifyInstance) {
  app.get("/programs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const programs = await service.list(req.businessId);
    return reply.send(programs);
  });

  app.post("/programs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = CreateProgramSchema.parse(req.body);
    const program = await service.create(req.businessId, input);
    return reply.status(201).send(program);
  });

  app.get("/programs/:programId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const program = await service.getOne(programId, req.businessId);
    return reply.send(program);
  });

  app.patch("/programs/:programId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const input = UpdateProgramSchema.parse(req.body);
    const program = await service.update(programId, req.businessId, input);
    return reply.send(program);
  });
}
