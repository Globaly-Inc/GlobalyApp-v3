import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import type { SharedCourses } from "../../../data-extraction/repositories/courses.repository.js";

const BRANCH_COLUMNS = [
  "uuid as id", "name", "country", "state", "city", "address", "phone", "email",
  "is_primary", "linked_business_id", "linked_institution_id", "branch_type", "share_description", "shared_services", "created_at",
];

function serializeBranchData<T extends Record<string, unknown>>(data: T): T {
  if (!("shared_services" in data)) return data;
  return { ...data, shared_services: JSON.stringify(data.shared_services) };
}

export type BranchFilter = "all" | "linked_branches" | "branches_only";

function applyBranchFilters<T extends Knex.QueryBuilder>(q: T, filter: BranchFilter, search?: string): T {
  if (filter === "branches_only") q.whereNull("linked_business_id").whereNull("linked_institution_id");
  else if (filter === "linked_branches") q.where((b) => b.whereNotNull("linked_business_id").orWhereNotNull("linked_institution_id"));
  if (search) {
    // A linked row shows its org's LIVE name (withLiveOrgDetails), so search must match that too,
    // not just the copy taken at link time. Master tables live in `public`, same database.
    const like = `%${search}%`;
    q.where((b) => b
      .whereILike("name", like)
      .orWhereIn("linked_business_id", (sub) =>
        sub.from("public.businesses").whereILike("business_name", like).whereNull("deleted_at").select("id"))
      .orWhereIn("linked_institution_id", (sub) =>
        sub.from("public.institutions").whereILike("institution_name", like).whereNull("deleted_at").select("id")));
  }
  return q;
}

export async function listBranches(
  businessId: number, schemaName: string, limit: number, offset: number, filter: BranchFilter, search?: string,
) {
  const db = await getKnex(businessId, schemaName);
  const rows = await applyBranchFilters(db("business_branches").whereNull("deleted_at"), filter, search)
    .select(BRANCH_COLUMNS).orderBy("is_primary", "desc").orderBy("created_at").limit(limit).offset(offset);
  return withLiveOrgDetails(rows);
}

/** A linked row's name/contact were copied at link time, but the branch org owns them (see
 * assertLinkOnlyPatch) — read them live so an edit on the branch's own profile shows up here. */
async function withLiveOrgDetails<T extends { linked_business_id: number | null; linked_institution_id: number | null }>(rows: T[]) {
  const bizIds = rows.map((r) => r.linked_business_id).filter((id): id is number => id != null);
  const instIds = rows.map((r) => r.linked_institution_id).filter((id): id is number => id != null);
  const [bizs, insts] = await Promise.all([
    bizIds.length ? orgDetails("businesses", "business_name", bizIds) : [],
    instIds.length ? orgDetails("institutions", "institution_name", instIds) : [],
  ]);
  const biz = new Map(bizs.map((o) => [o.id, o]));
  const inst = new Map(insts.map((o) => [o.id, o]));
  return rows.map((r) => {
    const org = r.linked_business_id != null ? biz.get(r.linked_business_id) : r.linked_institution_id != null ? inst.get(r.linked_institution_id) : undefined;
    if (!org) return r;
    const { id: _id, ...live } = org;
    return { ...r, ...live };
  });
}

function orgDetails(table: "businesses" | "institutions", nameCol: string, ids: number[]) {
  return masterKnex(`${table} as o`)
    .leftJoin("countries as c", "c.id", "o.country_id")
    .whereIn("o.id", ids)
    .select("o.id", `o.${nameCol} as name`, "c.name as country", "o.state", "o.city", "o.address", "o.phone", "o.email");
}

/** The partner's country, as the name the branch row stores (branch `country` is free text). */
async function countryName(countryId: number | null | undefined): Promise<string | null> {
  if (!countryId) return null;
  const row = await masterKnex("countries").where({ id: countryId }).first("name");
  return row?.name ?? null;
}

export async function countBranches(businessId: number, schemaName: string, filter: BranchFilter, search?: string) {
  const db = await getKnex(businessId, schemaName);
  const [{ count }] = await applyBranchFilters(db("business_branches").whereNull("deleted_at"), filter, search)
    .count("id as count");
  return Number(count);
}

export async function createBranch(businessId: number, schemaName: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("business_branches").insert(serializeBranchData(data)).returning(BRANCH_COLUMNS);
  return row;
}

export interface SeedCampus {
  id: string;
  name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export async function seedBranchesFromCampuses(businessId: number, schemaName: string, campuses: SeedCampus[]) {
  if (campuses.length === 0) return;
  const db = await getKnex(businessId, schemaName);
  await db("business_branches")
    .insert(campuses.map((c) => ({
      uuid: c.id,
      name: c.name ?? "Unnamed campus",
      country: c.country,
      state: c.state,
      city: c.city,
      address: c.address,
      phone: c.phone,
      email: c.email,
    })))
    .onConflict("uuid")
    .ignore();
}

export async function findBranchById(businessId: number, schemaName: string, branchId: string) {
  const db = await getKnex(businessId, schemaName);
  const row = await db("business_branches").where({ uuid: branchId }).whereNull("deleted_at").select(BRANCH_COLUMNS).first();
  return row ? (await withLiveOrgDetails([row]))[0] : row;
}

export async function updateBranch(businessId: number, schemaName: string, branchId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("business_branches")
    .where({ uuid: branchId })
    .update({ ...serializeBranchData(data), updated_at: db.fn.now() })
    .returning(BRANCH_COLUMNS);
  return row;
}

export async function linkExistingBranch(
  businessId: number,
  schemaName: string,
  data: { business_id: number; branch_type: string; shared_services: "all" | string[] },
) {
  const partner = await masterKnex("businesses").where({ id: data.business_id }).whereNull("deleted_at").first();
  if (!partner) return null;

  const parentDb = await getKnex(businessId, schemaName);
  const [branch] = await parentDb("business_branches")
    .insert({
      name: partner.business_name,
      country: await countryName(partner.country_id),
      state: partner.state,
      city: partner.city,
      address: partner.address,
      phone: partner.phone,
      email: partner.email,
      linked_business_id: partner.id,
      branch_type: data.branch_type,
      shared_services: JSON.stringify(data.shared_services),
    })
    .returning(BRANCH_COLUMNS);

  return { branch };
}

/** Same shape as linkExistingBranch, for an institution created via createInstitutionBranch —
 * the partner is an institutions row, not a businesses row, so linked_institution_id is set
 * instead of linked_business_id. */
export async function linkExistingInstitution(
  institutionId: number,
  schemaName: string,
  data: { institution_id: number; branch_type: string; shared_services: "all" | string[] },
) {
  const partner = await masterKnex("institutions").where({ id: data.institution_id }).whereNull("deleted_at").first();
  if (!partner) return null;

  const parentDb = await getKnex(institutionId, schemaName);
  const [branch] = await parentDb("business_branches")
    .insert({
      name: partner.institution_name,
      country: await countryName(partner.country_id),
      state: partner.state,
      city: partner.city,
      address: partner.address,
      phone: partner.phone,
      email: partner.email,
      linked_institution_id: partner.id,
      branch_type: data.branch_type,
      shared_services: JSON.stringify(data.shared_services),
    })
    .returning(BRANCH_COLUMNS);

  return { branch };
}

/** Rollback half of linkOrDiscard: soft-delete the parent's rows linking to an org being discarded. */
export async function discardLinkedBranches(
  parentId: number, schemaName: string, column: "linked_business_id" | "linked_institution_id", orgId: number,
) {
  const db = await getKnex(parentId, schemaName);
  await db("business_branches").where({ [column]: orgId }).whereNull("deleted_at").update({ deleted_at: db.fn.now() });
}

/**
 * A Same Company branch is the parent's own legal entity, so its registration is the parent's —
 * copied at creation (registrationFor) and re-copied here whenever the parent saves its own, or a
 * renewal would leave every branch profile quoting the old numbers.
 */
export async function syncSameCompanyRegistration(
  table: "businesses" | "institutions", parent: { id: number; schema_name: string }, registration: unknown,
) {
  const column = table === "businesses" ? "linked_business_id" : "linked_institution_id";
  const db = await getKnex(parent.id, parent.schema_name);
  const ids = await db("business_branches")
    .where({ branch_type: "same_company" }).whereNotNull(column).whereNull("deleted_at")
    .pluck(column);
  if (ids.length === 0) return;
  await masterKnex(table).whereIn("id", ids).update({ registration_licenses: registration ?? null, updated_at: masterKnex.fn.now() });
}

export async function deleteBranch(businessId: number, schemaName: string, branchId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_branches").where({ uuid: branchId }).update({ deleted_at: db.fn.now() });
}

/**
 * The courses shared INTO an institution by its parent (see institutions.parent_institution_id):
 * the parent's business_branches row for it — in the PARENT's schema — holds that choice. Walks
 * up the chain, since what a parent can share includes what its own parent shares with it. Null
 * when this isn't a branch or nothing is shared.
 */
export async function resolveSharedCourses(institutionId: number, depth = 0): Promise<SharedCourses | null> {
  // ponytail: depth cap guards a (should-be-impossible) parent cycle; the chains are 1–2 deep.
  if (depth >= 5) return null;
  const child = await masterKnex("institutions").where({ id: institutionId }).first("parent_institution_id");
  if (!child?.parent_institution_id) return null;
  const parent = await masterKnex("institutions")
    .where({ id: child.parent_institution_id }).whereNull("deleted_at")
    .first("id", "schema_name", "source_job_id");
  if (!parent?.source_job_id) return null;
  const parentDb = await getKnex(Number(parent.id), parent.schema_name);
  const link = await parentDb("business_branches")
    .where({ linked_institution_id: institutionId }).whereNull("deleted_at")
    .first("shared_services");
  const ids = link?.shared_services as "all" | string[] | null | undefined;
  if (!ids || (Array.isArray(ids) && ids.length === 0)) return null;
  return { jobId: String(parent.source_job_id), ids, shared: await resolveSharedCourses(Number(parent.id), depth + 1) };
}
