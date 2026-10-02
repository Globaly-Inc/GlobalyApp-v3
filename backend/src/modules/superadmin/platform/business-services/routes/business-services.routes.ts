// Superadmin routes for a single business's services.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import {
  AccreditationRowIdParamSchema, EligibilityIdParamSchema, FeeIdParamSchema, IdParamSchema,
  InstitutionAccreditationRowIdParamSchema, InstitutionEligibilityIdParamSchema, InstitutionFeeIdParamSchema,
  InstitutionIntakeIdParamSchema, InstitutionServiceAccreditationInputSchema, InstitutionStudyOptionIdParamSchema,
  InstitutionStudyUnitIdParamSchema, InstitutionSubIdParamSchema, IntakeIdParamSchema,
  ServiceAccreditationInputSchema, ServiceAiAssistSchema, ServiceEligibilityInputSchema, ServiceEligibilityPatchInputSchema,
  ServiceFeeInputSchema, ServiceFeePatchInputSchema,
  ServiceFieldValuesInputSchema, ServiceInputSchema, ServiceIntakeInputSchema, ServiceIntakePatchInputSchema,
  ServicePatchInputSchema, ServiceSearchQuerySchema, ServiceStudyOptionInputSchema, ServiceStudyOptionPatchInputSchema,
  ServiceStudyUnitInputSchema, ServiceStudyUnitPatchInputSchema, StudyOptionIdParamSchema, StudyUnitIdParamSchema, SubIdParamSchema,
} from "../schemas/business-services.schema.js";
import * as service from "../services/business-services.service.js";

export async function businessServicesRoutes(app: FastifyInstance) {
  // Org-agnostic: name/category is all the generator needs, so one route covers both the
  // business and institution admin Add Service forms.
  app.post("/services/ai-assist", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = ServiceAiAssistSchema.parse(req.body);
    const result = await service.generateServiceDescription(input);
    return reply.send(result);
  });

  app.get("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listServices(id));
  });

  app.get("/businesses/:id/services/search", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.searchServices(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/businesses/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createService(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateService(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  app.delete("/businesses/:id/services/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteService(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getServiceFieldValues(id, subId));
  });

  app.put("/businesses/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertServiceFieldValues(id, subId, values);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FIELDS_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  app.get("/businesses/:id/services/:subId/fees", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceFees(id, subId));
  });

  app.post("/businesses/:id/services/:subId/fees", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceFeeInputSchema.parse(req.body);
    const created = await service.createServiceFee(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FEE_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/businesses/:id/services/:subId/fees/:feeId", async (req, reply) => {
    const { id, subId, feeId } = FeeIdParamSchema.parse(req.params);
    const data = ServiceFeePatchInputSchema.parse(req.body);
    const updated = await service.updateServiceFee(id, subId, feeId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FEE_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  app.delete("/businesses/:id/services/:subId/fees/:feeId", async (req, reply) => {
    const { id, subId, feeId } = FeeIdParamSchema.parse(req.params);
    await service.deleteServiceFee(id, subId, feeId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_FEE_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/intakes", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceIntakes(id, subId));
  });

  app.post("/businesses/:id/services/:subId/intakes", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceIntakeInputSchema.parse(req.body);
    const created = await service.createServiceIntake(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_INTAKE_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/businesses/:id/services/:subId/intakes/:intakeId", async (req, reply) => {
    const { id, subId, intakeId } = IntakeIdParamSchema.parse(req.params);
    const data = ServiceIntakePatchInputSchema.parse(req.body);
    const updated = await service.updateServiceIntake(id, subId, intakeId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_INTAKE_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });

  app.delete("/businesses/:id/services/:subId/intakes/:intakeId", async (req, reply) => {
    const { id, subId, intakeId } = IntakeIdParamSchema.parse(req.params);
    await service.deleteServiceIntake(id, subId, intakeId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_INTAKE_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/eligibility", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceEligibility(id, subId));
  });
  app.post("/businesses/:id/services/:subId/eligibility", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceEligibilityInputSchema.parse(req.body);
    const created = await service.createServiceEligibility(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_ELIGIBILITY_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/businesses/:id/services/:subId/eligibility/:eligibilityId", async (req, reply) => {
    const { id, subId, eligibilityId } = EligibilityIdParamSchema.parse(req.params);
    const data = ServiceEligibilityPatchInputSchema.parse(req.body);
    const updated = await service.updateServiceEligibility(id, subId, eligibilityId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_ELIGIBILITY_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });
  app.delete("/businesses/:id/services/:subId/eligibility/:eligibilityId", async (req, reply) => {
    const { id, subId, eligibilityId } = EligibilityIdParamSchema.parse(req.params);
    await service.deleteServiceEligibility(id, subId, eligibilityId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_ELIGIBILITY_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/study-options", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceStudyOptions(id, subId));
  });
  app.post("/businesses/:id/services/:subId/study-options", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceStudyOptionInputSchema.parse(req.body);
    const created = await service.createServiceStudyOption(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_OPTION_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/businesses/:id/services/:subId/study-options/:optionId", async (req, reply) => {
    const { id, subId, optionId } = StudyOptionIdParamSchema.parse(req.params);
    const data = ServiceStudyOptionPatchInputSchema.parse(req.body);
    const updated = await service.updateServiceStudyOption(id, subId, optionId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_OPTION_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });
  app.delete("/businesses/:id/services/:subId/study-options/:optionId", async (req, reply) => {
    const { id, subId, optionId } = StudyOptionIdParamSchema.parse(req.params);
    await service.deleteServiceStudyOption(id, subId, optionId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_OPTION_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/study-units", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceStudyUnits(id, subId));
  });
  app.post("/businesses/:id/services/:subId/study-units", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceStudyUnitInputSchema.parse(req.body);
    const created = await service.createServiceStudyUnit(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_UNIT_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/businesses/:id/services/:subId/study-units/:unitId", async (req, reply) => {
    const { id, subId, unitId } = StudyUnitIdParamSchema.parse(req.params);
    const data = ServiceStudyUnitPatchInputSchema.parse(req.body);
    const updated = await service.updateServiceStudyUnit(id, subId, unitId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_UNIT_UPDATED", "business", undefined, { business_id: id });
    return reply.send(updated);
  });
  app.delete("/businesses/:id/services/:subId/study-units/:unitId", async (req, reply) => {
    const { id, subId, unitId } = StudyUnitIdParamSchema.parse(req.params);
    await service.deleteServiceStudyUnit(id, subId, unitId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_STUDY_UNIT_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  app.get("/businesses/:id/services/:subId/accreditations", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.listServiceAccreditations(id, subId));
  });
  app.post("/businesses/:id/services/:subId/accreditations", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ServiceAccreditationInputSchema.parse(req.body);
    const created = await service.createServiceAccreditation(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_ACCREDITATION_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(created);
  });
  app.delete("/businesses/:id/services/:subId/accreditations/:rowId", async (req, reply) => {
    const { id, subId, rowId } = AccreditationRowIdParamSchema.parse(req.params);
    await service.deleteServiceAccreditation(id, subId, rowId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_SERVICE_ACCREDITATION_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  // Institution twins — same business_services tenant table, only the owning-entity differs.

  app.get("/institutions/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServices(id));
  });

  app.get("/institutions/:id/services/search", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ServiceSearchQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.searchInstitutionServices(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/institutions/:id/services", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ServiceInputSchema.parse(req.body);
    const created = await service.createInstitutionService(id, data, Number(req.auth.sub));
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/institutions/:id/services/:subId", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServicePatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionService(id, subId, data, Number(req.auth.sub));
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });

  app.delete("/institutions/:id/services/:subId", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    await service.deleteInstitutionService(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.getInstitutionServiceFieldValues(id, subId));
  });

  app.put("/institutions/:id/services/:subId/field-values", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const { values } = ServiceFieldValuesInputSchema.parse(req.body);
    const updated = await service.upsertInstitutionServiceFieldValues(id, subId, values);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_FIELDS_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });

  app.get("/institutions/:id/services/:subId/fees", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceFees(id, subId));
  });

  app.post("/institutions/:id/services/:subId/fees", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServiceFeeInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceFee(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_FEE_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/institutions/:id/services/:subId/fees/:feeId", async (req, reply) => {
    const { id, subId, feeId } = InstitutionFeeIdParamSchema.parse(req.params);
    const data = ServiceFeePatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionServiceFee(id, subId, feeId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_FEE_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });

  app.delete("/institutions/:id/services/:subId/fees/:feeId", async (req, reply) => {
    const { id, subId, feeId } = InstitutionFeeIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceFee(id, subId, feeId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_FEE_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/intakes", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceIntakes(id, subId));
  });

  app.post("/institutions/:id/services/:subId/intakes", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServiceIntakeInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceIntake(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_INTAKE_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });

  app.patch("/institutions/:id/services/:subId/intakes/:intakeId", async (req, reply) => {
    const { id, subId, intakeId } = InstitutionIntakeIdParamSchema.parse(req.params);
    const data = ServiceIntakePatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionServiceIntake(id, subId, intakeId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_INTAKE_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });

  app.delete("/institutions/:id/services/:subId/intakes/:intakeId", async (req, reply) => {
    const { id, subId, intakeId } = InstitutionIntakeIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceIntake(id, subId, intakeId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_INTAKE_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/eligibility", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceEligibility(id, subId));
  });
  app.post("/institutions/:id/services/:subId/eligibility", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServiceEligibilityInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceEligibility(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_ELIGIBILITY_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/institutions/:id/services/:subId/eligibility/:eligibilityId", async (req, reply) => {
    const { id, subId, eligibilityId } = InstitutionEligibilityIdParamSchema.parse(req.params);
    const data = ServiceEligibilityPatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionServiceEligibility(id, subId, eligibilityId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_ELIGIBILITY_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });
  app.delete("/institutions/:id/services/:subId/eligibility/:eligibilityId", async (req, reply) => {
    const { id, subId, eligibilityId } = InstitutionEligibilityIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceEligibility(id, subId, eligibilityId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_ELIGIBILITY_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/study-options", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceStudyOptions(id, subId));
  });
  app.post("/institutions/:id/services/:subId/study-options", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServiceStudyOptionInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceStudyOption(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_OPTION_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/institutions/:id/services/:subId/study-options/:optionId", async (req, reply) => {
    const { id, subId, optionId } = InstitutionStudyOptionIdParamSchema.parse(req.params);
    const data = ServiceStudyOptionPatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionServiceStudyOption(id, subId, optionId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_OPTION_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });
  app.delete("/institutions/:id/services/:subId/study-options/:optionId", async (req, reply) => {
    const { id, subId, optionId } = InstitutionStudyOptionIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceStudyOption(id, subId, optionId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_OPTION_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/study-units", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceStudyUnits(id, subId));
  });
  app.post("/institutions/:id/services/:subId/study-units", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = ServiceStudyUnitInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceStudyUnit(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_UNIT_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });
  app.patch("/institutions/:id/services/:subId/study-units/:unitId", async (req, reply) => {
    const { id, subId, unitId } = InstitutionStudyUnitIdParamSchema.parse(req.params);
    const data = ServiceStudyUnitPatchInputSchema.parse(req.body);
    const updated = await service.updateInstitutionServiceStudyUnit(id, subId, unitId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_UNIT_UPDATED", "institution", undefined, { institution_id: id });
    return reply.send(updated);
  });
  app.delete("/institutions/:id/services/:subId/study-units/:unitId", async (req, reply) => {
    const { id, subId, unitId } = InstitutionStudyUnitIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceStudyUnit(id, subId, unitId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_STUDY_UNIT_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  app.get("/institutions/:id/services/:subId/accreditations", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionServiceAccreditations(id, subId));
  });
  app.post("/institutions/:id/services/:subId/accreditations", async (req, reply) => {
    const { id, subId } = InstitutionSubIdParamSchema.parse(req.params);
    const data = InstitutionServiceAccreditationInputSchema.parse(req.body);
    const created = await service.createInstitutionServiceAccreditation(id, subId, data.accreditation_id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_ACCREDITATION_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(created);
  });
  app.delete("/institutions/:id/services/:subId/accreditations/:rowId", async (req, reply) => {
    const { id, subId, rowId } = InstitutionAccreditationRowIdParamSchema.parse(req.params);
    await service.deleteInstitutionServiceAccreditation(id, subId, rowId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_SERVICE_ACCREDITATION_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });
}
