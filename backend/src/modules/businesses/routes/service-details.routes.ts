import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
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
  child: (typeof detailsService)["fees"],
  inputSchema: z.ZodType,
  patchSchema: z.ZodType,
) {
  app.get(`/services/:serviceId/${path}`, { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    return reply.send(await child.list(Number(req.business!.id), serviceId));
  });

  app.post(`/services/:serviceId/${path}`, { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const data = inputSchema.parse(req.body);
    return reply.status(201).send(await child.create(Number(req.business!.id), serviceId, data));
  });

  app.patch(`/services/:serviceId/${path}/:id`, { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId, id } = ChildIdParamSchema.parse(req.params);
    const data = patchSchema.parse(req.body);
    return reply.send(await child.update(Number(req.business!.id), serviceId, id, data));
  });

  app.delete(`/services/:serviceId/${path}/:id`, { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId, id } = ChildIdParamSchema.parse(req.params);
    await child.remove(Number(req.business!.id), serviceId, id);
    return reply.status(204).send();
  });
}

export async function businessServiceDetailsRoutes(app: FastifyInstance) {
  registerChildRoutes(app, "fees", detailsService.fees, FeeInputSchema, FeePatchInputSchema);
  registerChildRoutes(app, "intakes", detailsService.intakes, IntakeInputSchema, IntakePatchInputSchema);
  registerChildRoutes(app, "eligibility", detailsService.eligibility, EligibilityInputSchema, EligibilityPatchInputSchema);
  registerChildRoutes(app, "study-options", detailsService.studyOptions, StudyOptionInputSchema, StudyOptionPatchInputSchema);
  registerChildRoutes(app, "study-units", detailsService.studyUnits, StudyUnitInputSchema, StudyUnitPatchInputSchema);

  app.get("/services/:serviceId/accreditations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    return reply.send(await detailsService.listAccreditations(Number(req.business!.id), serviceId));
  });

  app.post("/services/:serviceId/accreditations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const { accreditation_id } = AccreditationLinkInputSchema.parse(req.body);
    return reply.status(201).send(await detailsService.linkAccreditation(Number(req.business!.id), serviceId, accreditation_id));
  });

  app.delete("/services/:serviceId/accreditations/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { serviceId, id } = AccreditationIdParamSchema.parse(req.params);
    await detailsService.unlinkAccreditation(Number(req.business!.id), serviceId, id);
    return reply.status(204).send();
  });
}
