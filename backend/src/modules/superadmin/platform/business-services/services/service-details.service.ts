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
