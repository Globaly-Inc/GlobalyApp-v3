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

// ─── Institution twins ──────────────────────────────────────────────────────
// An institution's own Branches tab: same `business_branches` tenant table (see the migration's
// comment), same repository functions — only the owning-entity lookup differs. No
// linkExistingBranch twin: linking another registered ORG as a branch is a business-to-business
// concept (see linked_business_id) that doesn't apply to an institution's own campuses.

async function requireInstitution(id: number) {
  const inst = await platformRepo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

export async function listInstitutionBranches(institutionId: number, limit: number, offset: number, filter: BranchFilter, search?: string) {
  const inst = await requireInstitution(institutionId);

  // Same fallback as listBranches: a promoted-but-unclaimed institution (never provisioned) has
  // no business_branches rows of its own yet — its scraped campuses stand in until claimed.
  if (inst.account_status === 0 && inst.source_job_id) {
    if (filter === "linked_branches") return { rows: [], total: 0 };
    const [rows, total] = await Promise.all([
      reviewRepo.listCampusesByJobPaged(inst.source_job_id, limit, offset, { search }),
      reviewRepo.countCampusesByJob(inst.source_job_id, { search }),
    ]);
    return { rows: rows.map(campusAsBranch), total };
  }

  const [rows, total] = await Promise.all([
    repo.listBranches(institutionId, inst.schema_name, limit, offset, filter, search),
    repo.countBranches(institutionId, inst.schema_name, filter, search),
  ]);
  return { rows, total };
}

export async function createInstitutionBranch(institutionId: number, data: BranchInput) {
  const inst = await requireInstitution(institutionId);
  return repo.createBranch(institutionId, inst.schema_name, data);
}

export async function updateInstitutionBranch(institutionId: number, branchId: string, data: BranchPatch) {
  const inst = await requireInstitution(institutionId);
  const existing = await repo.findBranchById(institutionId, inst.schema_name, branchId);
  if (!existing) throw new NotFoundError("Branch not found");
  return repo.updateBranch(institutionId, inst.schema_name, branchId, data);
}

export async function deleteInstitutionBranch(institutionId: number, branchId: string) {
  const inst = await requireInstitution(institutionId);
  return repo.deleteBranch(institutionId, inst.schema_name, branchId);
}
