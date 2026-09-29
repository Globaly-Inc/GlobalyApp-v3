// Business-branches service — branches of a single business, including linking
// another registered business as a branch.

import { BadRequestError, NotFoundError } from "../../../../../shared/errors.js";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import * as reviewRepo from "../../../data-extraction/repositories/review.repository.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-branches.repository.js";
import type { BranchFilter } from "../repositories/business-branches.repository.js";
import type { BranchInput, BranchPatch, LinkExistingBranchInput } from "../schemas/business-branches.schema.js";
import { registerBusiness } from "../../../../businesses/services/businesses.service.js";
import { onboardInstitution } from "../../../../platform-users/services/platform-users.service.js";

/** Branch country is free text on the branch form (no country_id field) — a real business/
 * institution row needs the FK, so this best-effort resolves it by name. Unmatched (typo, a
 * country not in the seeded list) falls back to no country rather than blocking branch creation. */
async function resolveCountryId(name?: string | null): Promise<number | undefined> {
  if (!name) return undefined;
  const row = await masterKnex("countries").where({ name }).first("id");
  return row?.id;
}

/** Minting the org and linking it into the parent's branch list span different DBs, so they can't
 * share a transaction. If anything after the mint fails, soft-delete the new org — otherwise it
 * lingers in the owner's org switcher with no branch row behind it, and a retry mints another
 * (both switcher queries filter deleted_at) — AND any branch row already inserted for it in the
 * parent, so a failure after the insert (parent pointer, share_description) can't leave the parent
 * a branch pointing at a deleted org.
 * ponytail: the provisioned schema is left behind; drop orphaned schemas in a cleanup job if it matters. */
async function linkOrDiscard<T>(
  table: "businesses" | "institutions", orgId: number,
  parent: { id: number; schema_name: string },
  link: () => Promise<T>,
): Promise<T> {
  try {
    return await link();
  } catch (err) {
    await masterKnex(table).where({ id: orgId }).update({ deleted_at: masterKnex.fn.now() });
    await repo.discardLinkedBranches(parent.id, parent.schema_name, table === "businesses" ? "linked_business_id" : "linked_institution_id", orgId);
    throw err;
  }
}

/** A linked row (a branch that is its own org) takes its name/contact from that org's profile —
 * editing them here would only change the parent's copy and leave the two out of sync. The parent
 * only controls how the branch is linked. */
const LINK_FIELDS = new Set(["branch_type", "share_description", "shared_services"]);
function assertLinkOnlyPatch(existing: { linked_business_id: number | null; linked_institution_id: number | null }, data: BranchPatch) {
  if (existing.linked_business_id == null && existing.linked_institution_id == null) return;
  const other = Object.keys(data).filter((k) => !LINK_FIELDS.has(k) && data[k as keyof BranchPatch] !== undefined);
  if (other.length > 0) {
    throw new BadRequestError(`This branch is its own organisation — edit ${other.join(", ")} from its own profile.`);
  }
}

/** A Same Company branch is the parent's own legal entity, so it shares the parent's registration
 * (the form doesn't ask for it); a subsidiary/franchise is separately registered and brings its own. */
function registrationFor(data: BranchInput, parentRegistration: unknown) {
  if (data.branch_type === "same_company") return (parentRegistration as Record<string, unknown> | null) ?? null;
  return data.registration_licenses ?? null;
}

/**
 * Keeps a created branch's registration matching its type when the type is edited: becoming
 * Same Company takes the parent's; leaving it drops the parent's copy (the branch then enters its
 * own from its profile). Only branches this parent created — see setOwnedBranchRegistration.
 */
async function syncRegistrationOnTypeChange(
  table: "businesses" | "institutions", parentId: number,
  existing: { branch_type: string; linked_business_id: number | null; linked_institution_id: number | null },
  data: BranchPatch, parentRegistration: unknown,
) {
  if (!data.branch_type || data.branch_type === existing.branch_type) return;
  const orgId = table === "businesses" ? existing.linked_business_id : existing.linked_institution_id;
  if (orgId == null) return;
  if (data.branch_type === "same_company") await repo.setOwnedBranchRegistration(table, parentId, [orgId], parentRegistration);
  else if (existing.branch_type === "same_company") await repo.setOwnedBranchRegistration(table, parentId, [orgId], null);
}

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

/**
 * "Create branch" mints a REAL, separately loggable business — same as v1 (BusinessBranchAdd
 * inserting a full `businesses` row + an owner `business_members` row atomically) — rather than
 * a plain address record with no account behind it. The parent's owner becomes that branch's
 * owner via registerBusiness's normal path (schema provisioned, agent row, user_business_index),
 * so it shows up in their org switcher immediately, then it's linked into THIS business's own
 * branch list the same way an existing business is (linkExistingBranch), so branches created here
 * and businesses linked from elsewhere both surface identically in the Branches tab.
 */
export async function createBranch(businessId: number, data: BranchInput) {
  const biz = await requireBusiness(businessId);
  // The PARENT's owner owns the branch — not whichever member created it — so the parent's owner
  // can always manage it (same as the superadmin create path).
  if (!biz.owner_id) throw new NotFoundError("Business has no owner to assign the new branch to");
  const countryId = await resolveCountryId(data.country);
  const { org } = await registerBusiness(Number(biz.owner_id), {
    business_name: data.name,
    business_type: (biz.business_type ?? undefined) as never,
    business_category_id: biz.business_category_id ?? undefined,
    phone: data.phone ?? undefined,
    country_id: countryId,
    state: data.state ?? undefined,
    city: data.city ?? undefined,
    address: data.address ?? undefined,
  });

  return linkOrDiscard("businesses", Number(org.id), { id: businessId, schema_name: biz.schema_name }, async () => {
    // registerBusiness takes no email — set it before linking so the branch row copies it too.
    if (data.email) await masterKnex("businesses").where({ id: Number(org.id) }).update({ email: data.email });
    const businessRegistration = registrationFor(data, biz.registration_licenses);
    if (businessRegistration) {
      await masterKnex("businesses").where({ id: Number(org.id) }).update({ registration_licenses: businessRegistration });
    }
    const result = await repo.linkExistingBranch(businessId, biz.schema_name, {
      business_id: Number(org.id),
      branch_type: data.branch_type,
      shared_services: data.shared_services,
    });
    if (!result) throw new NotFoundError("Business not found");
    // Lets the org switcher nest the branch under this parent.
    await masterKnex("businesses").where({ id: Number(org.id) }).update({ parent_business_id: businessId });
    if (!data.share_description) return result.branch;
    return repo.updateBranch(businessId, biz.schema_name, result.branch.id, { share_description: true });
  });
}

export async function getBranch(businessId: number, branchId: string) {
  const biz = await requireBusiness(businessId);
  const branch = await repo.findBranchById(businessId, biz.schema_name, branchId);
  if (!branch) throw new NotFoundError("Branch not found");
  return branch;
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
  assertLinkOnlyPatch(existing, data);
  const updated = await repo.updateBranch(businessId, biz.schema_name, branchId, data);
  await syncRegistrationOnTypeChange("businesses", businessId, existing, data, biz.registration_licenses);
  return updated;
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

/** Same reasoning as createBranch above, for an institution's own campuses — mints a real,
 * separately loggable institution via onboardInstitution (schema provisioned, owner member,
 * user_institution_index) instead of a plain address record, then links it the same way
 * linkExistingBranch does for businesses. */
export async function createInstitutionBranch(institutionId: number, data: BranchInput) {
  const inst = await requireInstitution(institutionId);
  // Parent's owner owns the branch — see createBranch.
  if (!inst.platform_user_id) throw new NotFoundError("Institution has no owner to assign the new branch to");
  const countryId = await resolveCountryId(data.country);
  const { institution } = await onboardInstitution(Number(inst.platform_user_id), {
    institution_name: data.name,
    institution_type: (inst.institution_type ?? undefined) as never,
    email: data.email ?? undefined,
    phone: data.phone ?? undefined,
    country_id: countryId,
    state: data.state ?? undefined,
    city: data.city ?? undefined,
    address: data.address ?? undefined,
  });

  return linkOrDiscard("institutions", Number(institution.id), { id: institutionId, schema_name: inst.schema_name }, async () => {
    // onboardInstitution takes no registration details — they belong on the new institution itself.
    const institutionRegistration = registrationFor(data, inst.registration_licenses);
    if (institutionRegistration) {
      await masterKnex("institutions").where({ id: Number(institution.id) }).update({ registration_licenses: institutionRegistration });
    }
    const result = await repo.linkExistingInstitution(institutionId, inst.schema_name, {
      institution_id: Number(institution.id),
      branch_type: data.branch_type,
      shared_services: data.shared_services,
    });
    if (!result) throw new NotFoundError("Institution not found");
    // Lets the branch find this parent later to read the courses shared with it.
    await masterKnex("institutions").where({ id: Number(institution.id) }).update({ parent_institution_id: institutionId });
    if (!data.share_description) return result.branch;
    return repo.updateBranch(institutionId, inst.schema_name, result.branch.id, { share_description: true });
  });
}

export async function getInstitutionBranch(institutionId: number, branchId: string) {
  const inst = await requireInstitution(institutionId);
  const branch = await repo.findBranchById(institutionId, inst.schema_name, branchId);
  if (!branch) throw new NotFoundError("Branch not found");
  return branch;
}

export async function updateInstitutionBranch(institutionId: number, branchId: string, data: BranchPatch) {
  const inst = await requireInstitution(institutionId);
  const existing = await repo.findBranchById(institutionId, inst.schema_name, branchId);
  if (!existing) throw new NotFoundError("Branch not found");
  assertLinkOnlyPatch(existing, data);
  const updated = await repo.updateBranch(institutionId, inst.schema_name, branchId, data);
  await syncRegistrationOnTypeChange("institutions", institutionId, existing, data, inst.registration_licenses);
  return updated;
}

export async function deleteInstitutionBranch(institutionId: number, branchId: string) {
  const inst = await requireInstitution(institutionId);
  return repo.deleteBranch(institutionId, inst.schema_name, branchId);
}
