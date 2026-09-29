import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  AccreditationLinkInputSchema, EligibilityInputSchema, EligibilityPatchInputSchema,
  FeeInputSchema, FeePatchInputSchema, IntakeInputSchema, IntakePatchInputSchema, ServiceIdParamSchema,
  StudyOptionInputSchema, StudyOptionPatchInputSchema, StudyUnitInputSchema, StudyUnitPatchInputSchema,
} from "../../superadmin/platform/business-services/schemas/service-details.schema.js";
import * as detailsService from "../../superadmin/platform/business-services/services/service-details.service.js";
import * as instService from "../../superadmin/platform/business-services/services/business-services.service.js";

// The child row's own id is a serial int for a business (business_services' own tenant tables)
// but a uuid for an institution (extraction sub-tables) — the same route path serves both, so
// the id is kept as the raw string here and only coerced to a number on the business branch.
const StringChildIdParamSchema = z.object({ serviceId: z.string().uuid(), id: z.string() });

/** Every institution child function this file's routes call, keyed the same way as `detailsService`'s
 *  business-scoped ones, so registerChildRoutes can pick the matching quartet by name. */
const institutionChildFns = {
  fees: {
    list: instService.listInstitutionServiceFees, create: instService.createInstitutionServiceFee,
    update: instService.updateInstitutionServiceFee, remove: instService.deleteInstitutionServiceFee,
  },
  intakes: {
    list: instService.listInstitutionServiceIntakes, create: instService.createInstitutionServiceIntake,
    update: instService.updateInstitutionServiceIntake, remove: instService.deleteInstitutionServiceIntake,
  },
  eligibility: {
    list: instService.listInstitutionServiceEligibility, create: instService.createInstitutionServiceEligibility,
    update: instService.updateInstitutionServiceEligibility, remove: instService.deleteInstitutionServiceEligibility,
  },
  studyOptions: {
    list: instService.listInstitutionServiceStudyOptions, create: instService.createInstitutionServiceStudyOption,
    update: instService.updateInstitutionServiceStudyOption, remove: instService.deleteInstitutionServiceStudyOption,
  },
  studyUnits: {
    list: instService.listInstitutionServiceStudyUnits, create: instService.createInstitutionServiceStudyUnit,
    update: instService.updateInstitutionServiceStudyUnit, remove: instService.deleteInstitutionServiceStudyUnit,
  },
} as const;

function orgScopedId(req: FastifyRequest): number {
  return Number(req.auth.orgType === "institution" ? req.institution!.id : req.business!.id);
}

/** One list/create/patch/delete route quartet per child resource — same shape, different table + schema.
 *  Branches on org type: an institution's rows live in the extraction sub-tables (business-services.service.ts's
 *  Institution* functions), a business's in its own tenant schema (detailsService's child, below). */
function registerChildRoutes(
  app: FastifyInstance,
  path: string,
  child: (typeof detailsService)["fees"],
  instChild: (typeof institutionChildFns)[keyof typeof institutionChildFns],
  inputSchema: z.ZodType,
  patchSchema: z.ZodType,
) {
  app.get(`/services/:serviceId/${path}`, { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const id = orgScopedId(req);
    return reply.send(req.auth.orgType === "institution" ? await instChild.list(id, serviceId) : await child.list(id, serviceId));
  });

  app.post(`/services/:serviceId/${path}`, { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const data = inputSchema.parse(req.body);
    const id = orgScopedId(req);
    const created = req.auth.orgType === "institution" ? await instChild.create(id, serviceId, data) : await child.create(id, serviceId, data);
    return reply.status(201).send(created);
  });

  app.patch(`/services/:serviceId/${path}/:id`, { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId, id: rowId } = StringChildIdParamSchema.parse(req.params);
    const data = patchSchema.parse(req.body);
    const id = orgScopedId(req);
    const updated = req.auth.orgType === "institution"
      ? await instChild.update(id, serviceId, rowId, data)
      : await child.update(id, serviceId, Number(rowId), data);
    return reply.send(updated);
  });

  app.delete(`/services/:serviceId/${path}/:id`, { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId, id: rowId } = StringChildIdParamSchema.parse(req.params);
    const id = orgScopedId(req);
    if (req.auth.orgType === "institution") await instChild.remove(id, serviceId, rowId);
    else await child.remove(id, serviceId, Number(rowId));
    return reply.status(204).send();
  });
}

export async function businessServiceDetailsRoutes(app: FastifyInstance) {
  registerChildRoutes(app, "fees", detailsService.fees, institutionChildFns.fees, FeeInputSchema, FeePatchInputSchema);
  registerChildRoutes(app, "intakes", detailsService.intakes, institutionChildFns.intakes, IntakeInputSchema, IntakePatchInputSchema);
  registerChildRoutes(
    app, "eligibility", detailsService.eligibility, institutionChildFns.eligibility, EligibilityInputSchema, EligibilityPatchInputSchema,
  );
  registerChildRoutes(
    app, "study-options", detailsService.studyOptions, institutionChildFns.studyOptions,
    StudyOptionInputSchema, StudyOptionPatchInputSchema,
  );
  registerChildRoutes(
    app, "study-units", detailsService.studyUnits, institutionChildFns.studyUnits,
    StudyUnitInputSchema, StudyUnitPatchInputSchema,
  );

  app.get("/services/:serviceId/accreditations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const id = orgScopedId(req);
    return reply.send(
      req.auth.orgType === "institution"
        ? await instService.listInstitutionServiceAccreditations(id, serviceId)
        : await detailsService.listAccreditations(id, serviceId),
    );
  });

  app.post("/services/:serviceId/accreditations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId } = ServiceIdParamSchema.parse(req.params);
    const { accreditation_id } = AccreditationLinkInputSchema.parse(req.body);
    const id = orgScopedId(req);
    const created = req.auth.orgType === "institution"
      ? await instService.createInstitutionServiceAccreditation(id, serviceId, accreditation_id)
      : await detailsService.linkAccreditation(id, serviceId, accreditation_id);
    return reply.status(201).send(created);
  });

  app.delete("/services/:serviceId/accreditations/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { serviceId, id: rowId } = StringChildIdParamSchema.parse(req.params);
    const id = orgScopedId(req);
    if (req.auth.orgType === "institution") await instService.deleteInstitutionServiceAccreditation(id, serviceId, rowId);
    else await detailsService.unlinkAccreditation(id, serviceId, Number(rowId));
    return reply.status(204).send();
  });
}
