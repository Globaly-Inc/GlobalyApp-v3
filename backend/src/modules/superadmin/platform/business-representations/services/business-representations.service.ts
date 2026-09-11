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
  // Validated against the table the kind names, not always `businesses` — otherwise an
  // institution id would be rejected as a missing business, or worse, accepted because some
  // unrelated business happens to hold that number.
  const partnerIsInstitution = data.partner_kind === "institution";
  if (partnerIsInstitution) await requireInstitution(data.partner_business_id);
  else await requireBusiness(data.partner_business_id);

  // Nothing back means the link is already there and live. A removed one is revived by the
  // upsert instead, so "unlink, then link again" works — it used to 409 forever, because the
  // soft-deleted row kept holding the unique key.
  const relation = await repo.createRelation(businessId, data);
  if (!relation) {
    throw new ConflictError(`This ${partnerIsInstitution ? "institution" : "business"} is already linked as a partner`);
  }

  if (data.apply_to_branches) {
    const branchBusinessIds = await repo.listLinkedBranchBusinessIds(businessId, biz.schema_name);
    for (const branchBusinessId of branchBusinessIds) {
      // Only meaningful when the partner is itself a business — a branch business id and an
      // institution id can be equal while referring to entirely different orgs, so comparing
      // them across kinds would skip a branch that should have been linked.
      if (!partnerIsInstitution && branchBusinessId === data.partner_business_id) continue;
      // A branch that already has the link returns nothing; that is the intended no-op.
      await repo.createRelation(branchBusinessId, data);
    }
  }

  return relation;
}

/**
 * The business-owner self-service "Link consultancy" flow ONLY — mirrors V1's fixed
 * agent<->institution pairing (requireVerifiedAgent/requireVerifiedInstitution above), then
 * delegates to the generic `createRelation` for the actual insert/branch-cascade logic.
 *
 * Deliberately NOT folded into `createRelation` itself: the admin panel's generic business
 * "Link consultancy" dialog (frontend admin/platform/businesses/components/partners/
 * link-consultancy-dialog.tsx) calls the SAME `createRelation` service to create arbitrary
 * business-to-business/institution relations across any business_type, with no `partner_kind`
 * sent at all (defaults to "business") — putting the agent/institution restriction inside
 * `createRelation` itself made every admin call 400, since that dialog isn't the V1 consultancy
 * feature at all, just a generically-named admin relation tool that happens to share the table.
 */
export async function createConsultancyRelation(businessId: number, data: RelationInput) {
  const biz = await requireBusiness(businessId);
  if (biz.business_type !== "agent") {
    throw new BadRequestError("Only an education agency can link an institution as a partner");
  }
  if (data.partner_kind !== "institution") {
    throw new BadRequestError("An education agency can only link a verified institution as a partner");
  }
  await requireVerifiedInstitution(data.partner_business_id);
  return createRelation(businessId, data);
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
