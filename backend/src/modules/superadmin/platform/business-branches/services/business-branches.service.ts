// Business-branches service — branches of a single business, including linking
// another registered business as a branch.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-branches.repository.js";
import type { BranchFilter } from "../repositories/business-branches.repository.js";
import type { BranchInput, BranchPatch, LinkExistingBranchInput } from "../schemas/business-branches.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function listBranches(businessId: number, limit: number, offset: number, filter: BranchFilter, search?: string) {
  const biz = await requireBusiness(businessId);
  const [rows, total] = await Promise.all([
    repo.listBranches(businessId, biz.schema_name, limit, offset, filter, search),
    repo.countBranches(businessId, biz.schema_name, filter, search),
  ]);
  return { rows, total };
}

export async function createBranch(businessId: number, data: BranchInput) {
  const biz = await requireBusiness(businessId);
  return repo.createBranch(businessId, biz.schema_name, data);
}

export async function linkExistingBranch(businessId: number, data: LinkExistingBranchInput) {
  const biz = await requireBusiness(businessId);
  const result = await repo.linkExistingBranch(businessId, biz.schema_name, data);
  if (!result) throw new NotFoundError("Business not found");
  return result;
}

export async function updateBranch(businessId: number, branchId: string, data: BranchPatch) {
  const biz = await requireBusiness(businessId);
  const existing = await repo.findBranchById(businessId, biz.schema_name, branchId);
  if (!existing) throw new NotFoundError("Branch not found");
  return repo.updateBranch(businessId, biz.schema_name, branchId, data);
}

export async function deleteBranch(businessId: number, branchId: string) {
  const biz = await requireBusiness(businessId);
  return repo.deleteBranch(businessId, biz.schema_name, branchId);
}
