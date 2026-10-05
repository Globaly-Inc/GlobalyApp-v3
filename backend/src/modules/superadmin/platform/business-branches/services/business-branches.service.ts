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
import { createChildLogger } from "../../../../../shared/logger.js";
import { BranchInputSchema } from "../schemas/business-branches.schema.js";
import { countryCurrency } from "../../../../../shared/country-currency.js";

const logger = createChildLogger("business-branches");

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
 * Same Company takes the parent's. Leaving it keeps whatever is there — the branch may have edited
 * it on its own profile, and clearing would lose that; from then on it's the branch's to change.
 * Only branches this parent created — see setOwnedBranchRegistration.
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
}

/** The branch org this parent CREATED (its parent_*_id points here), or null for a plain row or a
 * linked org that belongs to someone else. A created branch is the parent's to manage, so its
 * details are editable from the parent's Branches tab — see writeOwnedBranchDetails. */
async function ownedBranchOrgId(
  table: "businesses" | "institutions", parentId: number,
  existing: { linked_business_id: number | null; linked_institution_id: number | null },
): Promise<number | null> {
  const orgId = table === "businesses" ? existing.linked_business_id : existing.linked_institution_id;
  if (orgId == null) return null;
  const parentColumn = table === "businesses" ? "parent_business_id" : "parent_institution_id";
  const row = await masterKnex(table).where({ id: orgId, [parentColumn]: parentId }).whereNull("deleted_at").first("id");
  return row ? orgId : null;
}

/** Writes name/contact onto the branch org itself — the list reads them live from there
 * (withLiveOrgDetails), so the org's own profile and the parent's list stay in step. */
async function writeOwnedBranchDetails(table: "businesses" | "institutions", orgId: number, data: BranchPatch) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch[table === "businesses" ? "business_name" : "institution_name"] = data.name;
  for (const k of ["state", "city", "address", "phone", "email", "website"] as const) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  if (data.country !== undefined) patch.country_id = (await resolveCountryId(data.country)) ?? null;
  if (Object.keys(patch).length === 0) return;
  await masterKnex(table).where({ id: orgId }).update({ ...patch, updated_at: masterKnex.fn.now() });
}

/**
 * An admin edit to a campus that was converted into a branch org (extraction Branches tab) — the
 * org's own profile IS that branch now, so the edit goes there (branch-sync's
 * syncBranchFromCampus). `parent` is the head office; `branchId` its business_branches row for the
 * branch (extraction_campuses.converted_branch_id). Only the campus fields in `changed` are
 * written, so an untouched (possibly stale) campus value never overwrites the branch owner's own.
 */
export async function syncConvertedCampusToBranch(
  parent: { id: number; schema_name: string }, branchId: string, changed: Record<string, unknown>,
) {
  const data: BranchPatch = {};
  for (const k of ["name", "country", "state", "city", "address", "phone", "email"] as const) {
    if (k in changed) (data as Record<string, unknown>)[k] = k === "name" ? (String(changed[k] ?? "").trim() || "Unnamed campus") : changed[k];
  }
  if (Object.keys(data).length === 0) return;
  const link = await repo.findBranchById(parent.id, parent.schema_name, branchId);
  if (!link) return;
  const table = link.linked_institution_id != null ? "institutions" : link.linked_business_id != null ? "businesses" : null;
  if (!table) return;
  await writeOwnedBranchDetails(table, Number(link.linked_institution_id ?? link.linked_business_id), data);
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
    extracted: true,
  };
}

/** Own branches first, then the source job's scraped campuses as read-only stand-ins. Campuses are
 * never copied into business_branches, so a claimed org that ran its own extraction would otherwise
 * never see them. An unclaimed org (no tenant schema) passes ownTotal 0 and listOwn is never called. */
async function ownThenCampuses(
  jobId: string | null, filter: BranchFilter, search: string | undefined, limit: number, offset: number,
  ownTotal: number, listOwn: (limit: number, offset: number) => Promise<unknown[]>,
) {
  const campusTotal = jobId && filter !== "linked_branches" ? await reviewRepo.countCampusesByJob(jobId, { search, unconverted: true }) : 0;
  const own = offset < ownTotal ? await listOwn(limit, offset) : [];
  const room = limit - own.length;
  const campuses = jobId && room > 0 && campusTotal > 0
    ? await reviewRepo.listCampusesByJobPaged(jobId, room, Math.max(0, offset - ownTotal), { search, unconverted: true })
    : [];
  // origin: the portal's Extracted / Manual chip — a converted campus counts as extracted.
  const converted = await reviewRepo.convertedBranchIds(own.map((r) => String((r as { id: string }).id)));
  const ownRows = own.map((r) => ({ ...(r as object), origin: converted.has(String((r as { id: string }).id)) ? "extracted" : "manual" }));
  return { rows: [...ownRows, ...campuses.map((c) => ({ ...campusAsBranch(c), origin: "extracted" }))], total: ownTotal + campusTotal };
}

export async function listBranches(businessId: number, limit: number, offset: number, filter: BranchFilter, search?: string) {
  const biz = await requireBusiness(businessId);

  // A pre-seeded business (account_status 0) has no tenant schema yet — campuses only.
  const ownTotal = biz.account_status === 0 ? 0 : await repo.countBranches(businessId, biz.schema_name, filter, search);
  return ownThenCampuses(biz.source_job_id, filter, search, limit, offset, ownTotal,
    (l, o) => repo.listBranches(businessId, biz.schema_name, l, o, filter, search));
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
type CampusClaim = { id: string; claimId: string };

/** campus: set only by convertCampusesToBranches, which has already claimed that campus. */
export async function createBranch(businessId: number, data: BranchInput, campus?: CampusClaim) {
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
    const website = data.website === undefined ? biz.website : data.website;
    if (website) await masterKnex("businesses").where({ id: Number(org.id) }).update({ website });
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
    const branch = data.share_description
      ? await repo.updateBranch(businessId, biz.schema_name, result.branch.id, { share_description: true })
      : result.branch;
    // Inside linkOrDiscard: if stamping fails, the new org is discarded rather than left beside its campus.
    if (campus) await reviewRepo.markCampusConverted(campus.id, campus.claimId, result.branch.id);
    return branch;
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
  const ownedOrgId = await ownedBranchOrgId("businesses", businessId, existing);
  if (ownedOrgId == null) assertLinkOnlyPatch(existing, data);
  else await writeOwnedBranchDetails("businesses", ownedOrgId, data);
  // business_branches has no website column — it lives only on the branch org (above).
  const { website: _website, ...rowData } = data;
  const updated = await repo.updateBranch(businessId, biz.schema_name, branchId, rowData);
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

  // Same as listBranches: a promoted-but-unclaimed institution has no tenant schema yet.
  const ownTotal = inst.account_status === 0 ? 0 : await repo.countBranches(institutionId, inst.schema_name, filter, search);
  return ownThenCampuses(inst.source_job_id, filter, search, limit, offset, ownTotal,
    (l, o) => repo.listBranches(institutionId, inst.schema_name, l, o, filter, search));
}

/** Same reasoning as createBranch above, for an institution's own campuses — mints a real,
 * separately loggable institution via onboardInstitution (schema provisioned, owner member,
 * user_institution_index) instead of a plain address record, then links it the same way
 * linkExistingBranch does for businesses. */
export async function createInstitutionBranch(institutionId: number, data: BranchInput, campus?: CampusClaim) {
  const inst = await requireInstitution(institutionId);
  // Parent's owner owns the branch — see createBranch.
  if (!inst.platform_user_id) throw new NotFoundError("Institution has no owner to assign the new branch to");
  const countryId = await resolveCountryId(data.country);
  // A campus often lists the head office's address — onboardInstitution drops an email already taken.
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
    const website = data.website === undefined ? inst.website : data.website;
    if (website) await masterKnex("institutions").where({ id: Number(institution.id) }).update({ website });
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
    const branch = data.share_description
      ? await repo.updateBranch(institutionId, inst.schema_name, result.branch.id, { share_description: true })
      : result.branch;
    if (campus) await reviewRepo.markCampusConverted(campus.id, campus.claimId, result.branch.id);
    return branch;
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
  const ownedOrgId = await ownedBranchOrgId("institutions", institutionId, existing);
  if (ownedOrgId == null) assertLinkOnlyPatch(existing, data);
  else await writeOwnedBranchDetails("institutions", ownedOrgId, data);
  const { website: _website, ...rowData } = data;
  const updated = await repo.updateBranch(institutionId, inst.schema_name, branchId, rowData);
  await syncRegistrationOnTypeChange("institutions", institutionId, existing, data, inst.registration_licenses);
  return updated;
}

export async function deleteInstitutionBranch(institutionId: number, branchId: string) {
  const inst = await requireInstitution(institutionId);
  return repo.deleteBranch(institutionId, inst.schema_name, branchId);
}

// ─── Extracted campuses → real branches ─────────────────────────────────────
// Every campus scraped by a claimed org's source job becomes a real branch org, exactly as if the
// owner had used "Create branch" — so it shows in the org switcher. Runs when an extraction
// finishes; older jobs (and campuses an admin adds later) go through `npm run job:convert-campuses`.
// Never on a request: minting an org provisions a schema, too slow and too costly to retry per visit.
// Never throws. A failed campus is marked (failCampus) and not retried — the mint may already have
// left a provisioned schema behind (see linkOrDiscard) — and keeps showing as an extracted campus.

/** What a branch shows that only its head office has: the brand and the extracted profile. */
// Not currency: it follows the BRANCH's own country (a UK campus of a Nepali head office is GBP).
const INHERITED_PROFILE_COLUMNS = [
  "logo_url", "cover_url", "gallery_images", "description",
  "linkedin_url", "facebook_url", "instagram_url", "twitter_url", "youtube_url", "whatsapp_url",
] as const;

/**
 * Fills a branch's BLANK profile fields from its head office — a campus converted to a branch
 * starts with only its name and address, so its profile page had no logo, cover, photos or
 * description. Never overwrites what the branch already has (an emptied gallery counts as set).
 */
export async function inheritHeadOfficeProfile(table: "institutions" | "businesses", branchId: number, parentId: number) {
  const columns = table === "institutions" ? [...INHERITED_PROFILE_COLUMNS, "other_social_links"] : [...INHERITED_PROFILE_COLUMNS];
  const [branch, parent] = await Promise.all([
    masterKnex(table).where({ id: branchId }).first([...columns, "currency", "country_id"]),
    masterKnex(table).where({ id: parentId }).first([...columns, "currency", "country_id"]),
  ]);
  if (!branch || !parent) return;
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  const patch: Record<string, unknown> = {};
  for (const col of columns) {
    if (!blank(branch[col]) || blank(parent[col])) continue;
    // jsonb — stringified, or pg sends the array as a Postgres array literal. gallery_images is text[].
    patch[col] = col === "other_social_links" ? JSON.stringify(parent[col]) : parent[col];
  }
  // Currency from the branch's own country — when blank, or when it is just the head office's
  // carried over to a branch in another country (what an earlier version of this copied).
  const own = await countryCurrency(branch.country_id);
  const carriedOver = branch.currency === parent.currency && branch.country_id !== parent.country_id;
  if (own && own !== branch.currency && (blank(branch.currency) || carriedOver)) patch.currency = own;
  if (Object.keys(patch).length > 0) {
    await masterKnex(table).where({ id: branchId }).update({ ...patch, updated_at: masterKnex.fn.now() });
  }
}

type CampusRow = Awaited<ReturnType<typeof reviewRepo.listCampusesByJobPaged>>[number];
type ConvertingOrg = { kind: "institutions" | "businesses"; id: number; schema_name: string };

/** Turns one already-claimed campus into a branch org linked to `org`. Throws on failure, after
 * putting back anything it retired and marking the campus failed. Returns the new branch link. */
async function convertClaimedCampus(org: ConvertingOrg, c: CampusRow, claimId: string, jobId: string) {
  let retiredCopy = false;
  try {
    // Same website as the head office, so it shares the head office's catalog rather than
    // extracting its own: the courses linked to this campus, or all of them when none are.
    const courseIds = await reviewRepo.listCourseIdsByCampus(c.id);
    const data = BranchInputSchema.parse({
      name: c.name?.trim() || "Unnamed campus", country: c.country, state: c.state, city: c.city,
      address: c.address, phone: c.phone, email: c.email,
      shared_services: courseIds.length > 0 ? courseIds : "all",
    });
    // Listings claimed before this conversion existed got each campus copied in as a PLAIN
    // branch row (uuid = the campus id — branch-sync's seedBranchesFromJob). Retire that copy
    // FIRST: creating the branch records the campus as converted, after which no run revisits
    // it — so a cleanup after that point that failed would leave the campus listed twice. If
    // the create then fails, the copy is put back (catch below), so the owner never loses it.
    retiredCopy = (await repo.deleteBranch(org.id, org.schema_name, c.id)) > 0;
    const branch = org.kind === "institutions"
      ? await createInstitutionBranch(org.id, data, { id: c.id, claimId })
      : await createBranch(org.id, data, { id: c.id, claimId });
    // Best-effort: the branch exists either way; the backfill script can fill it later.
    const link = branch as { linked_institution_id?: number | null; linked_business_id?: number | null } | null;
    const child = Number(link?.linked_institution_id ?? link?.linked_business_id);
    if (child) {
      await inheritHeadOfficeProfile(org.kind, child, org.id).catch((err) =>
        logger.warn("Branch profile inherit failed", { jobId, campusId: c.id, error: String(err) }),
      );
    }
    return branch;
  } catch (err) {
    // Only the copy THIS run retired — never one the owner deleted themselves.
    if (retiredCopy) await repo.restoreBranch(org.id, org.schema_name, c.id).catch(() => {});
    await reviewRepo.failCampus(c.id, claimId);
    logger.warn("Campus → branch conversion failed", { jobId, campusId: c.id, error: String(err) });
    throw err;
  }
}

/** The provisioned org a job feeds — an unprovisioned one (account_status 0) has no tenant schema to link into. */
async function convertingOrgForJob(jobId: string): Promise<ConvertingOrg | null> {
  for (const kind of ["institutions", "businesses"] as const) {
    const row = await masterKnex(kind).where({ source_job_id: jobId }).whereNull("deleted_at")
      .whereNot({ account_status: 0 }).first("id", "schema_name");
    if (row) return { kind, id: Number(row.id), schema_name: row.schema_name };
  }
  return null;
}

export async function convertCampusesToBranches(jobId: string): Promise<number> {
  try {
    const org = await convertingOrgForJob(jobId);
    if (!org) return 0;
    const campuses = await reviewRepo.listCampusesByJobPaged(jobId, 1000, 0, { unconverted: true });
    let converted = 0;
    for (const c of campuses) {
      const claimId = await reviewRepo.claimCampus(c.id);
      if (!claimId) continue; // another run holds it
      if (await convertClaimedCampus(org, c, claimId, jobId).then(() => true, () => false)) converted += 1;
    }
    return converted;
  } catch (err) {
    logger.warn("Campus → branch conversion skipped", { jobId, error: String(err) });
    return 0;
  }
}

/**
 * The owner opening an extracted campus to edit it: converts just that campus to a real branch
 * now, instead of waiting for the extraction to finish, and returns its branch link id for the
 * edit form. Retries a campus whose earlier automatic conversion failed. Already converted → its id.
 */
export async function convertCampusOnDemand(kind: "institutions" | "businesses", orgId: number, campusId: string) {
  const owner = await masterKnex(kind).where({ id: orgId }).whereNull("deleted_at").first("id", "schema_name", "source_job_id");
  const jobId = owner?.source_job_id ? String(owner.source_job_id) : null;
  if (!owner || !jobId) throw new NotFoundError("Campus not found");
  const campus = await masterKnex("superadmin.extraction_campuses").where({ id: campusId, job_id: jobId }).first();
  if (!campus) throw new NotFoundError("Campus not found");
  if (campus.converted_branch_id) return { branch_id: String(campus.converted_branch_id) };

  // An explicit retry by the owner — clear an earlier automatic failure so the claim can take it.
  await masterKnex("superadmin.extraction_campuses").where({ id: campusId }).whereNull("converted_branch_id")
    .update({ convert_failed_at: null });
  const claimId = await reviewRepo.claimCampus(campusId);
  if (!claimId) throw new BadRequestError("This branch is being set up right now — try again in a moment");
  const org: ConvertingOrg = { kind, id: Number(owner.id), schema_name: owner.schema_name };
  const branch = await convertClaimedCampus(org, campus as CampusRow, claimId, jobId);
  return { branch_id: String((branch as { id: string }).id) };
}
