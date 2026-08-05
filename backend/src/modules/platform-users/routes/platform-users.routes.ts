// Platform user routes — auth-required profile, onboarding steps, and sub-resource CRUD.

import type { FastifyInstance } from "fastify";
import {
  UpdateCategorySchema,
  UpdateSubCategorySchema,
  OnboardingPersonalSchema, OnboardingBusinessSchema, OnboardingInstitutionSchema,
  ProfilePatchSchema,
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

  // ── Onboarding step APIs (called in order after registration) ──

  // Step 1: Set user category (personal | business)
  app.patch("/me/category", async (req, reply) => {
    const { user_category } = UpdateCategorySchema.parse(req.body);
    const result = await service.updateCategory(Number(req.auth.sub), user_category);
    return reply.send(result);
  });

  // Step 2: Set user sub-category
  app.patch("/me/sub-category", async (req, reply) => {
    const { user_sub_category } = UpdateSubCategorySchema.parse(req.body);
    const result = await service.updateSubCategory(Number(req.auth.sub), user_sub_category);
    return reply.send(result);
  });

  // Step 3: Set onboarding profile — dispatches by user_category
  app.patch("/me/onboarding-profile", async (req, reply) => {
    const userId = Number(req.auth.sub);
    const user = await service.getUserForOnboarding(userId);

    if (user.user_category === "business") {
      // institution, everything else → business with tenant DB
      if (user.user_sub_category === "institution") {
        const data = OnboardingInstitutionSchema.parse(req.body);
        const result = await service.onboardInstitution(userId, data);
        return reply.status(201).send(result);
      }
      const data = OnboardingBusinessSchema.parse(req.body);
      const result = await service.onboardBusiness(userId, data);
      return reply.status(201).send(result);
    }

    // personal (student / parents / explorer)
    const data = OnboardingPersonalSchema.parse(req.body);
    const result = await service.onboardPersonal(userId, data);
    return reply.send(result);
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
