// Staged entities + junctions routes — maps V2 endpoints SO1-SO3, CE1-CE8, SA1-SA2,
// AC1-AC4, J1-J3.

import type { FastifyInstance } from "fastify";
import * as service from "../services/staged.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import {
  CreateStudyOptionSchema,
  PatchStudyOptionSchema,
  CreateCourseFeeSchema,
  CreateIntakeSchema,
  CreateEligibilitySchema,
  CreateStudyUnitSchema,
  CreateStagedAccreditationSchema,
  CreateAgentSchema,
  CreateCampusSchema,
  JunctionParamSchema,
  JunctionBodySchema,
  AccreditationMappingSchema,
} from "../schemas/staged.schema.js";

export async function stagedRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // ── Study options ──

  // SO1: POST /study-options
  app.post("/study-options", async (req, reply) => {
    const input = CreateStudyOptionSchema.parse(req.body);
    return reply.send(await service.createStudyOption(input, adminId(req)));
  });

  // SO2: PATCH /study-options/:id
  app.patch("/study-options/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchStudyOptionSchema.parse(req.body);
    return reply.send(await service.patchStudyOption(id, input, adminId(req)));
  });

  // SO3: DELETE /study-options/:id
  app.delete("/study-options/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteStudyOption(id, adminId(req)));
  });

  // ── Course fees ──

  // CE1: POST /course-fees
  app.post("/course-fees", async (req, reply) => {
    const input = CreateCourseFeeSchema.parse(req.body);
    return reply.send(await service.createCourseFee(input, adminId(req)));
  });

  // CE2: DELETE /course-fees/:id
  app.delete("/course-fees/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteCourseFee(id, adminId(req)));
  });

  // ── Intakes ──

  // CE3: POST /intakes
  app.post("/intakes", async (req, reply) => {
    const input = CreateIntakeSchema.parse(req.body);
    return reply.send(await service.createIntake(input, adminId(req)));
  });

  // CE4: DELETE /intakes/:id
  app.delete("/intakes/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteIntake(id, adminId(req)));
  });

  // ── Eligibility requirements ──

  // CE5: POST /eligibility-requirements
  app.post("/eligibility-requirements", async (req, reply) => {
    const input = CreateEligibilitySchema.parse(req.body);
    return reply.send(await service.createEligibility(input, adminId(req)));
  });

  // CE6: DELETE /eligibility-requirements/:id
  app.delete("/eligibility-requirements/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteEligibility(id, adminId(req)));
  });

  // ── Study units ──

  // CE7: POST /study-units
  app.post("/study-units", async (req, reply) => {
    const input = CreateStudyUnitSchema.parse(req.body);
    return reply.send(await service.createStudyUnit(input, adminId(req)));
  });

  // CE8: DELETE /study-units/:id
  app.delete("/study-units/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteStudyUnit(id, adminId(req)));
  });

  // ── Staged accreditations ──

  // SA1: POST /staged-accreditations
  app.post("/staged-accreditations", async (req, reply) => {
    const input = CreateStagedAccreditationSchema.parse(req.body);
    return reply.send(await service.createAccreditation(input, adminId(req)));
  });

  // SA2: DELETE /staged-accreditations/:id
  app.delete("/staged-accreditations/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteAccreditation(id, adminId(req)));
  });

  // ── Agents ──

  // AC1: POST /agents
  app.post("/agents", async (req, reply) => {
    const input = CreateAgentSchema.parse(req.body);
    return reply.send(await service.createAgent(input, adminId(req)));
  });

  // AC2: DELETE /agents/:id
  app.delete("/agents/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteAgent(id, adminId(req)));
  });

  // ── Campuses ──

  // AC3: POST /campuses
  app.post("/campuses", async (req, reply) => {
    const input = CreateCampusSchema.parse(req.body);
    return reply.send(await service.createCampus(input, adminId(req)));
  });

  // AC4: DELETE /campuses/:id
  app.delete("/campuses/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteCampus(id, adminId(req)));
  });

  // ── Junctions ──

  // J1: POST /junctions/:junction/assign
  app.post("/junctions/:junction/assign", async (req, reply) => {
    const { junction } = JunctionParamSchema.parse(req.params);
    const body = JunctionBodySchema.parse(req.body);
    return reply.send(await service.assignJunction(junction, body, adminId(req)));
  });

  // J2: DELETE /junctions/:junction/assign
  app.delete("/junctions/:junction/assign", async (req, reply) => {
    const { junction } = JunctionParamSchema.parse(req.params);
    const body = JunctionBodySchema.parse(req.body);
    return reply.send(await service.unassignJunction(junction, body, adminId(req)));
  });

  // J3: PATCH /accreditation-mappings
  app.patch("/accreditation-mappings", async (req, reply) => {
    const body = AccreditationMappingSchema.parse(req.body);
    return reply.send(
      await service.updateAccreditationMappings(
        body.job_id,
        body.extraction_accreditation_ids,
        body.accreditation_id,
        adminId(req),
      ),
    );
  });
}
