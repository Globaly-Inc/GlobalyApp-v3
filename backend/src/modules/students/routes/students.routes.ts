// Student routes — public registration & auth + auth-required profile & sub-resource CRUD.

import type { FastifyInstance } from "fastify";
import {
  StudentRegisterSchema, StudentProfilePatchSchema,
  QualificationSchema, LanguageTestSchema, WorkExperienceSchema,
  IdParamSchema,
} from "../schemas/students.schema.js";
import * as service from "../services/students.service.js";

export async function studentRoutes(app: FastifyInstance) {
  // ── Public ──

  app.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = StudentRegisterSchema.parse(req.body);
    const result = await service.registerStudent(input);
    return reply.status(201).send(result);
  });

  // ── Auth-required: Profile ──

  app.get("/me", async (req, reply) => {
    const result = await service.getProfile(Number(req.auth.sub));
    return reply.send(result);
  });

  app.patch("/me", async (req, reply) => {
    const data = StudentProfilePatchSchema.parse(req.body);
    const result = await service.updateProfile(Number(req.auth.sub), data);
    return reply.send(result);
  });

  // ── Qualifications ──

  app.post("/me/qualifications", async (req, reply) => {
    const data = QualificationSchema.parse(req.body);
    const result = await service.addQualification(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  app.patch("/me/qualifications/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = QualificationSchema.partial().parse(req.body);
    const result = await service.editQualification(id, Number(req.auth.sub), data);
    return reply.send(result);
  });

  app.delete("/me/qualifications/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.removeQualification(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // ── Language Tests ──

  app.post("/me/language-tests", async (req, reply) => {
    const data = LanguageTestSchema.parse(req.body);
    const result = await service.addLanguageTest(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  app.patch("/me/language-tests/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = LanguageTestSchema.partial().parse(req.body);
    const result = await service.editLanguageTest(id, Number(req.auth.sub), data);
    return reply.send(result);
  });

  app.delete("/me/language-tests/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.removeLanguageTest(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // ── Work Experiences ──

  app.post("/me/work-experiences", async (req, reply) => {
    const data = WorkExperienceSchema.parse(req.body);
    const result = await service.addWorkExperience(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  app.patch("/me/work-experiences/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = WorkExperienceSchema.partial().parse(req.body);
    const result = await service.editWorkExperience(id, Number(req.auth.sub), data);
    return reply.send(result);
  });

  app.delete("/me/work-experiences/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.removeWorkExperience(id, Number(req.auth.sub));
    return reply.status(204).send();
  });
}
