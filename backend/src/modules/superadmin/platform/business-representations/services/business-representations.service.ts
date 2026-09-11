import { BadRequestError, ConflictError, NotFoundError } from "../../../../../shared/errors.js";
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

// Mirrors V1: representations are one fixed pairing, a verified education agency (business_type
// "agent") on one side and a verified institution on the other — never business-to-business or
// institution-to-institution. V1 enforced this in the UI only (no DB constraint); V3's polymorphic
// partner_kind model dropped that check entirely, letting either side link any kind/type.
async function requireVerifiedAgent(id: number) {
  const biz = await requireBusiness(id);
  if (biz.business_type !== "agent" || biz.status !== "verified") {
    throw new BadRequestError("Only a verified education agency can be linked as a partner");
  }
  return biz;
}

async function requireVerifiedInstitution(id: number) {
  const inst = await requireInstitution(id);
  if (inst.status !== "verified") {
    throw new BadRequestError("Only a verified institution can be linked as a partner");
  }
  return inst;
}

export async function listRelations(businessId: number, limit: number, offset: number, search?: string) {
  await requireBusiness(businessId);
  return repo.listRelations(businessId, limit, offset, search);
}

export async function createRelation(businessId: number, data: RelationInput) {
  const biz = await requireBusiness(businessId);
  // Only an education agency may use this endpoint to link a partner, and only a verified institution
  // — see requireVerifiedAgent/requireVerifiedInstitution above.
  if (biz.business_type !== "agent") {
    throw new BadRequestError("Only an education agency can link an institution as a partner");
  }
  if (data.partner_kind !== "institution") {
    throw new BadRequestError("An education agency can only link a verified institution as a partner");
  }
  await requireVerifiedInstitution(data.partner_business_id);

  // Nothing back means the link is already there and live. A removed one is revived by the
  // upsert instead, so "unlink, then link again" works — it used to 409 forever, because the
  // soft-deleted row kept holding the unique key.
  const relation = await repo.createRelation(businessId, data);
  if (!relation) {
    throw new ConflictError("This institution is already linked as a partner");
  }

  if (data.apply_to_branches) {
    const branchBusinessIds = await repo.listLinkedBranchBusinessIds(businessId, biz.schema_name);
    for (const branchBusinessId of branchBusinessIds) {
      // A branch that already has the link returns nothing; that is the intended no-op.
      await repo.createRelation(branchBusinessId, data);
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
  await requireVerifiedAgent(businessId);

  const relation = await repo.createRelationForInstitution(businessId, institutionId, data);
  if (!relation) throw new ConflictError("This education agency is already linked as a partner");
  return relation;
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
