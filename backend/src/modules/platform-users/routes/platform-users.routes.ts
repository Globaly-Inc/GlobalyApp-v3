// Platform user routes — auth-required profile, onboarding, and sub-resource CRUD.

import type { FastifyInstance } from "fastify";
import {
  OnboardingPersonalSchema, OnboardingBusinessSchema, OnboardingInstitutionSchema,
  ProfilePatchSchema, UpdateCategorySchema,
  QualificationSchema, LanguageTestSchema, WorkExperienceSchema,
  IdParamSchema, CountryIdParamSchema,
} from "../schemas/platform-users.schema.js";
import * as service from "../services/platform-users.service.js";

export async function platformUserRoutes(app: FastifyInstance) {
  // ── Profile ──

  app.get("/me", async (req, reply) => {
    const result = await service.getProfile(Number(req.auth.sub));
    return reply.send(result);
  });

  app.patch("/me", async (req, reply) => {
    const data = ProfilePatchSchema.parse(req.body);
    const result = await service.updateProfile(Number(req.auth.sub), data);
    return reply.send(result);
  });

  app.patch("/me/category", async (req, reply) => {
    const { user_category } = UpdateCategorySchema.parse(req.body);
    const result = await service.updateCategory(Number(req.auth.sub), user_category);
    return reply.send(result);
  });

  // ── Onboarding — separate endpoints for personal and business ──
  // A user can call both — they can have a personal profile AND own businesses.

  app.post("/me/onboarding/personal", async (req, reply) => {
    const data = OnboardingPersonalSchema.parse(req.body);
    const result = await service.onboardPersonal(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  app.post("/me/onboarding/business", async (req, reply) => {
    const data = OnboardingBusinessSchema.parse(req.body);
    const result = await service.onboardBusiness(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  app.post("/me/onboarding/institution", async (req, reply) => {
    const data = OnboardingInstitutionSchema.parse(req.body);
    const result = await service.onboardInstitution(Number(req.auth.sub), data);
    return reply.status(201).send(result);
  });

  // ── Countries / Cities ──

  app.get("/countries", async (_req, reply) => {
    const result = await service.listCountries();
    return reply.send({ countries: result });
  });

  app.get("/countries/:id/cities", async (req, reply) => {
    const { id } = CountryIdParamSchema.parse(req.params);
    const result = await service.getCitiesByCountry(id);
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
