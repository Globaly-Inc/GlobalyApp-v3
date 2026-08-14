import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";

const BRANCH_COLUMNS = [
  "uuid as id", "name", "country", "state", "city", "address", "phone", "email",
  "is_primary", "linked_business_id", "branch_type", "share_description", "shared_services", "created_at",
];

function serializeBranchData<T extends Record<string, unknown>>(data: T): T {
  if (!("shared_services" in data)) return data;
  return { ...data, shared_services: JSON.stringify(data.shared_services) };
}

export type BranchFilter = "all" | "linked_branches" | "branches_only";

function applyBranchFilters<T extends Knex.QueryBuilder>(q: T, filter: BranchFilter, search?: string): T {
  if (filter === "branches_only") q.whereNull("linked_business_id");
  else if (filter === "linked_branches") q.whereNotNull("linked_business_id");
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function listBranches(
  businessId: number, schemaName: string, limit: number, offset: number, filter: BranchFilter, search?: string,
) {
  const db = await getKnex(businessId, schemaName);
  return applyBranchFilters(db("business_branches").whereNull("deleted_at"), filter, search)
    .select(BRANCH_COLUMNS).orderBy("is_primary", "desc").orderBy("created_at").limit(limit).offset(offset);
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

export async function findBranchById(businessId: number, schemaName: string, branchId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_branches").where({ uuid: branchId }).whereNull("deleted_at").select(BRANCH_COLUMNS).first();
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
      country: null,
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

export async function deleteBranch(businessId: number, schemaName: string, branchId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_branches").where({ uuid: branchId }).update({ deleted_at: db.fn.now() });
}
