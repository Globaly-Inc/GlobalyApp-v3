// Business-partners service — agency/consultancy links for a single business.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-partners.repository.js";
import type { PartnerStatusInput } from "../schemas/business-partners.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function listBusinessPartners(businessId: number) {
  const biz = await requireBusiness(businessId);
  return repo.listBusinessPartners(businessId, biz.schema_name);
}

export async function createBusinessPartner(businessId: number, partnerBusinessId: number) {
  const biz = await requireBusiness(businessId);
  await requireBusiness(partnerBusinessId);
  return repo.createBusinessPartner(businessId, biz.schema_name, partnerBusinessId);
}

export async function updateBusinessPartnerStatus(businessId: number, partnerId: string, status: PartnerStatusInput["status"]) {
  const biz = await requireBusiness(businessId);
  return repo.updateBusinessPartnerStatus(businessId, biz.schema_name, partnerId, status);
}

export async function deleteBusinessPartner(businessId: number, partnerId: string) {
  const biz = await requireBusiness(businessId);
  return repo.deleteBusinessPartner(businessId, biz.schema_name, partnerId);
}
