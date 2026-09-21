// Self-service institution service-details routes — institution context required.
// The institution twin of businesses' fees/intakes/eligibility/study-options/study-units/
// accreditations routes (service-details.routes.ts) — same child tables, different owning entity.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  AccreditationLinkInputSchema, ChildIdParamSchema, EligibilityInputSchema, EligibilityPatchInputSchema,
  FeeInputSchema, FeePatchInputSchema, IntakeInputSchema, IntakePatchInputSchema, ServiceIdParamSchema,
  StudyOptionInputSchema, StudyOptionPatchInputSchema, StudyUnitInputSchema, StudyUnitPatchInputSchema,
} from "../../superadmin/platform/business-services/schemas/service-details.schema.js";
import * as detailsService from "../../superadmin/platform/business-services/services/service-details.service.js";

const AccreditationIdParamSchema = z.object({ serviceId: z.string().uuid(), id: z.coerce.number().int().positive() });

/** One list/create/patch/delete route quartet per child resource — same shape, different table + schema. */
function registerChildRoutes(
  app: FastifyInstance,
  path: string,
  child: (typeof detailsService)["institutionFees"],
  inputSchema: z.ZodType,
  patchSchema: z.ZodType,
) {
  app.get(`/services/:serviceId/${path}`, { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    return reply.send(await child.list(req.institutionId, serviceId));
  });

  app.post(`/services/:serviceId/${path}`, { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const data = inputSchema.parse(req.body);
    return reply.status(201).send(await child.create(req.institutionId, serviceId, data));
  });

  app.patch(`/services/:serviceId/${path}/:id`, { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId, id } = ChildIdParamSchema.parse(req.params);
    const data = patchSchema.parse(req.body);
    return reply.send(await child.update(req.institutionId, serviceId, id, data));
  });

  app.delete(`/services/:serviceId/${path}/:id`, { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId, id } = ChildIdParamSchema.parse(req.params);
    await child.remove(req.institutionId, serviceId, id);
    return reply.status(204).send();
  });
}

export async function institutionServiceDetailsRoutes(app: FastifyInstance) {
  registerChildRoutes(app, "fees", detailsService.institutionFees, FeeInputSchema, FeePatchInputSchema);
  registerChildRoutes(app, "intakes", detailsService.institutionIntakes, IntakeInputSchema, IntakePatchInputSchema);
  registerChildRoutes(app, "eligibility", detailsService.institutionEligibility, EligibilityInputSchema, EligibilityPatchInputSchema);
  registerChildRoutes(app, "study-options", detailsService.institutionStudyOptions, StudyOptionInputSchema, StudyOptionPatchInputSchema);
  registerChildRoutes(app, "study-units", detailsService.institutionStudyUnits, StudyUnitInputSchema, StudyUnitPatchInputSchema);

  app.get("/services/:serviceId/accreditations", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    return reply.send(await detailsService.listInstitutionAccreditations(req.institutionId, serviceId));
  });

  app.post("/services/:serviceId/accreditations", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const { accreditation_id } = AccreditationLinkInputSchema.parse(req.body);
    return reply.status(201).send(await detailsService.linkInstitutionAccreditation(req.institutionId, serviceId, accreditation_id));
  });

  app.delete("/services/:serviceId/accreditations/:id", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { serviceId, id } = AccreditationIdParamSchema.parse(req.params);
    await detailsService.unlinkInstitutionAccreditation(req.institutionId, serviceId, id);
    return reply.status(204).send();
  });
}
