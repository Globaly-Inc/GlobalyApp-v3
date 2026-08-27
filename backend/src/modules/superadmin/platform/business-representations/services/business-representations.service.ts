import { ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-representations.repository.js";
import type { RelationInput, RelationPatch } from "../schemas/business-representations.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

async function requireInstitution(id: number) {
  const inst = await platformRepo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

export async function listRelations(businessId: number, limit: number, offset: number, search?: string) {
  await requireBusiness(businessId);
  return repo.listRelations(businessId, limit, offset, search);
}

export async function createRelation(businessId: number, data: RelationInput) {
  const biz = await requireBusiness(businessId);
  await requireBusiness(data.partner_business_id);

  let relation;
  try {
    relation = await repo.createRelation(businessId, data);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ConflictError("This business is already linked as a partner");
    throw e;
  }

  if (data.apply_to_branches) {
    const branchBusinessIds = await repo.listLinkedBranchBusinessIds(businessId, biz.schema_name);
    for (const branchBusinessId of branchBusinessIds) {
      if (branchBusinessId === data.partner_business_id) continue;
      await repo.createRelation(branchBusinessId, data, true);
    }
  }

  return relation;
}

export async function updateRelation(businessId: number, relationId: string, data: RelationPatch) {
  await requireBusiness(businessId);
  const relation = await repo.updateRelation(businessId, relationId, data);
  if (!relation) throw new NotFoundError("Relation not found");
  return relation;
}

export async function deleteRelation(businessId: number, relationId: string) {
  await requireBusiness(businessId);
  return repo.deleteRelation(businessId, relationId);
}

export const isActivePartner = repo.isActivePartner;

// ─── Institution twins ──────────────────────────────────────────────────────
// An institution's own Partners tab: same table, mirror-image direction (see repository).

export async function listInstitutionRelations(institutionId: number, limit: number, offset: number, search?: string) {
  await requireInstitution(institutionId);
  return repo.listByPartnerInstitutionId(institutionId, limit, offset, search);
}

export async function createInstitutionRelation(institutionId: number, businessId: number, data: RelationPatch) {
  await requireInstitution(institutionId);
  await requireBusiness(businessId);

  try {
    return await repo.createRelationForInstitution(businessId, institutionId, data);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ConflictError("This institution is already linked as a partner");
    throw e;
  }
}

export async function updateInstitutionRelation(institutionId: number, relationId: string, data: RelationPatch) {
  await requireInstitution(institutionId);
  const relation = await repo.updateRelationForInstitution(institutionId, relationId, data);
  if (!relation) throw new NotFoundError("Relation not found");
  return relation;
}

export async function deleteInstitutionRelation(institutionId: number, relationId: string) {
  await requireInstitution(institutionId);
  return repo.deleteRelationForInstitution(institutionId, relationId);
}
