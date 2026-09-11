// Business-branches service — branches of a single business, including linking
// another registered business as a branch.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as reviewRepo from "../../../data-extraction/repositories/review.repository.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-branches.repository.js";
import type { BranchFilter } from "../repositories/business-branches.repository.js";
import type { BranchInput, BranchPatch, LinkExistingBranchInput } from "../schemas/business-branches.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

/** A campus scraped by the source extraction job, shaped like a real (but uneditable) branch. */
function campusAsBranch(c: { id: string; name: string | null; country: string | null; state: string | null; city: string | null; address: string | null; phone: string | null; email: string | null; created_at: string }) {
  return {
    id: c.id, name: c.name ?? "Unnamed campus", country: c.country, state: c.state, city: c.city,
    address: c.address, phone: c.phone, email: c.email, is_primary: false, linked_business_id: null,
    branch_type: "same_company", share_description: false, shared_services: [], created_at: c.created_at,
  };
}

export async function listBranches(businessId: number, limit: number, offset: number, filter: BranchFilter, search?: string) {
  const biz = await requireBusiness(businessId);

  // Same fallback as the business list/detail counts: a pre-seeded business (never provisioned)
  // has no business_branches rows of its own — the extraction job's scraped campuses are read-only
  // stand-ins until it's claimed and actually gets a tenant schema.
  if (biz.account_status === 0 && biz.source_job_id) {
    if (filter === "linked_branches") return { rows: [], total: 0 };
    const [rows, total] = await Promise.all([
      reviewRepo.listCampusesByJobPaged(biz.source_job_id, limit, offset, { search }),
      reviewRepo.countCampusesByJob(biz.source_job_id, { search }),
    ]);
    return { rows: rows.map(campusAsBranch), total };
  }

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
