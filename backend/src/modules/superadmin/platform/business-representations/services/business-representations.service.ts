// Business-representations service — subsidiary/franchise/partner relations between a
// business's own entities (surfaced in the Branches tab).

import { ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-representations.repository.js";
import type { RelationInput, RelationPatch } from "../schemas/business-representations.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function listRelations(businessId: number, limit: number, offset: number) {
  await requireBusiness(businessId);
  return repo.listRelations(businessId, limit, offset);
}

export async function createRelation(businessId: number, data: RelationInput) {
  const biz = await requireBusiness(businessId);
  const partner = await requireBusiness(data.partner_business_id);

  let relation;
  try {
    relation = await repo.createRelation(businessId, data, partner.business_name, partner.logo_url);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ConflictError("This business is already linked as a partner");
    throw e;
  }

  if (data.apply_to_branches) {
    const branchBusinessIds = await repo.listLinkedBranchBusinessIds(businessId, biz.schema_name);
    for (const branchBusinessId of branchBusinessIds) {
      if (branchBusinessId === data.partner_business_id) continue;
      await repo.createRelation(branchBusinessId, data, partner.business_name, partner.logo_url, true);
    }
  }


  return { ...relation, business_type: partner.business_type };
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
