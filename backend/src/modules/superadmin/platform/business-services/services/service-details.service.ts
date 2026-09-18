// Service-details service — course fees / intakes / eligibility / study options / study
// units / accreditations, scoped to one business + one service.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/service-details.repository.js";

async function requireBusiness(businessId: number) {
  const biz = await platformRepo.findBusinessById(businessId);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

function makeChildService(childRepo: typeof repo.feesRepo) {
  return {
    list: async (businessId: number, serviceId: string) => {
      const biz = await requireBusiness(businessId);
      return childRepo.list(businessId, biz.schema_name, serviceId);
    },
    create: async (businessId: number, serviceId: string, data: Record<string, unknown>) => {
      const biz = await requireBusiness(businessId);
      return childRepo.create(businessId, biz.schema_name, serviceId, data);
    },
    update: async (businessId: number, serviceId: string, id: number, data: Record<string, unknown>) => {
      const biz = await requireBusiness(businessId);
      const row = await childRepo.update(businessId, biz.schema_name, serviceId, id, data);
      if (!row) throw new NotFoundError("Not found");
      return row;
    },
    remove: async (businessId: number, serviceId: string, id: number) => {
      const biz = await requireBusiness(businessId);
      await childRepo.remove(businessId, biz.schema_name, serviceId, id);
    },
  };
}

export const fees = makeChildService(repo.feesRepo);
export const intakes = makeChildService(repo.intakesRepo);
export const eligibility = makeChildService(repo.eligibilityRepo);
export const studyOptions = makeChildService(repo.studyOptionsRepo);
export const studyUnits = makeChildService(repo.studyUnitsRepo);

export async function listAccreditations(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listAccreditations(businessId, biz.schema_name, serviceId);
}

export async function linkAccreditation(businessId: number, serviceId: string, accreditationId: number) {
  const biz = await requireBusiness(businessId);
  return repo.linkAccreditation(businessId, biz.schema_name, serviceId, accreditationId);
}

export async function unlinkAccreditation(businessId: number, serviceId: string, id: number) {
  const biz = await requireBusiness(businessId);
  await repo.unlinkAccreditation(businessId, biz.schema_name, serviceId, id);
}

// ─── Institution twins ──────────────────────────────────────────────────────
// Same child tables, same repository functions — only the owning-entity lookup differs,
// mirroring business-services.service.ts's own "Institution twins" section.

async function requireInstitution(institutionId: number) {
  const inst = await platformRepo.findInstitutionById(institutionId);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

function makeChildInstitutionService(childRepo: typeof repo.feesRepo) {
  return {
    list: async (institutionId: number, serviceId: string) => {
      const inst = await requireInstitution(institutionId);
      return childRepo.list(institutionId, inst.schema_name, serviceId);
    },
    create: async (institutionId: number, serviceId: string, data: Record<string, unknown>) => {
      const inst = await requireInstitution(institutionId);
      return childRepo.create(institutionId, inst.schema_name, serviceId, data);
    },
    update: async (institutionId: number, serviceId: string, id: number, data: Record<string, unknown>) => {
      const inst = await requireInstitution(institutionId);
      const row = await childRepo.update(institutionId, inst.schema_name, serviceId, id, data);
      if (!row) throw new NotFoundError("Not found");
      return row;
    },
    remove: async (institutionId: number, serviceId: string, id: number) => {
      const inst = await requireInstitution(institutionId);
      await childRepo.remove(institutionId, inst.schema_name, serviceId, id);
    },
  };
}

export const institutionFees = makeChildInstitutionService(repo.feesRepo);
export const institutionIntakes = makeChildInstitutionService(repo.intakesRepo);
export const institutionEligibility = makeChildInstitutionService(repo.eligibilityRepo);
export const institutionStudyOptions = makeChildInstitutionService(repo.studyOptionsRepo);
export const institutionStudyUnits = makeChildInstitutionService(repo.studyUnitsRepo);

export async function listInstitutionAccreditations(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  return repo.listAccreditations(institutionId, inst.schema_name, serviceId);
}

export async function linkInstitutionAccreditation(institutionId: number, serviceId: string, accreditationId: number) {
  const inst = await requireInstitution(institutionId);
  return repo.linkAccreditation(institutionId, inst.schema_name, serviceId, accreditationId);
}

export async function unlinkInstitutionAccreditation(institutionId: number, serviceId: string, id: number) {
  const inst = await requireInstitution(institutionId);
  await repo.unlinkAccreditation(institutionId, inst.schema_name, serviceId, id);
}
