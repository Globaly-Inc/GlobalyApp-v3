// Business-services service — services offered by a single business, plus their
// dynamic per-category field values.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-services.repository.js";
import type { ServiceFieldValuesInput, ServiceInput, ServicePatchInput } from "../schemas/business-services.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function listServices(businessId: number) {
  const biz = await requireBusiness(businessId);
  return repo.listServices(businessId, biz.schema_name);
}

export async function searchServices(businessId: number, limit: number, offset: number, search?: string) {
  const biz = await requireBusiness(businessId);
  return repo.searchServices(businessId, biz.schema_name, limit, offset, search);
}

export async function createService(businessId: number, data: ServiceInput) {
  const biz = await requireBusiness(businessId);
  return repo.createService(businessId, biz.schema_name, data);
}

export async function updateService(businessId: number, serviceId: string, data: ServicePatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateService(businessId, biz.schema_name, serviceId, data);
}

export async function deleteService(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.deleteService(businessId, biz.schema_name, serviceId);
}

export async function getServiceFieldValues(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.getServiceFieldValues(businessId, biz.schema_name, serviceId);
}

export async function upsertServiceFieldValues(businessId: number, serviceId: string, values: ServiceFieldValuesInput["values"]) {
  const biz = await requireBusiness(businessId);
  return repo.upsertServiceFieldValues(businessId, biz.schema_name, serviceId, values);
}
