// Repository for admin-managed business listings — CRUD, members, activity.

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { SUPERADMIN_SCHEMA as S } from "../../../consts.js";

const now = () => masterKnex.fn.now();

function businessListQuery() {
  return masterKnex("businesses as b")
    .leftJoin("platform_users as owner", "owner.id", "b.owner_id")
    .leftJoin("business_categories as cat", "cat.id", "b.business_category_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .whereNull("b.deleted_at");
}

function applyBusinessFilters<T extends ReturnType<typeof businessListQuery>>(
  q: T,
  search?: string,
  status?: string,
  category?: number,
  categorySlug?: string,
) {
  if (search) {
    q.where((b) =>
      b.whereILike("b.business_name", `%${search}%`)
        .orWhereILike("b.email", `%${search}%`)
        .orWhereILike("b.subdomain", `%${search}%`),
    );
  }
  if (status) q.where({ "b.status": status });
  if (category) q.where({ "b.business_category_id": category });
  if (categorySlug) q.where({ "cat.slug": categorySlug });
  return q;
}

export async function listBusinesses(
  limit: number, offset: number, search?: string, status?: string, category?: number, categorySlug?: string,
) {
  const q = applyBusinessFilters(businessListQuery(), search, status, category, categorySlug)
    .select(
      "b.id", "b.business_name", "b.subdomain", "b.business_type", "b.business_category_id",
      "b.email", "b.phone", "b.status", "b.is_published", "b.country_id", "b.city",
      "b.logo_url", "b.account_status", "b.created_at",
      "b.owner_id", "b.schema_name", "b.profile_views",
      masterKnex.raw("b.owner_id IS NULL as is_unclaimed"),
      "cat.name as category_name",
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .orderBy("b.created_at", "desc")
    .limit(limit).offset(offset);
  const rows = await q;

  await Promise.all(
    rows.map(async (row: any) => {
      try {
        const tenantDb = await getKnex(row.id, row.schema_name);
        const [[{ count: branchCount }], [{ count: serviceCount }]] = await Promise.all([
          tenantDb("business_branches").whereNull("deleted_at").count("* as count"),
          tenantDb("business_services").whereNull("deleted_at").count("* as count"),
        ]);
        row.branch_count = Number(branchCount);
        row.service_count = Number(serviceCount);
      } catch {
        row.branch_count = 0;
        row.service_count = 0;
      }
    }),
  );

  return rows;
}

export async function countBusinesses(search?: string, status?: string, category?: number, categorySlug?: string) {
  const q = applyBusinessFilters(businessListQuery(), search, status, category, categorySlug).count("b.id as count");
  const [row] = await q;
  return Number(row.count);
}

export async function findBusinessById(id: number) {
  return masterKnex("businesses").where({ id }).whereNull("deleted_at").first();
}

export async function findBusinessDetail(id: number) {
  const row = await businessListQuery()
    .where("b.id", id)
    .select(
      "b.*",
      masterKnex.raw("b.owner_id IS NULL as is_unclaimed"),
      "cat.name as category_name",
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .first();
  if (!row) return row;
  try {
    const tenantDb = await getKnex(row.id, row.schema_name);
    const [[{ count: branchCount }], [{ count: serviceCount }]] = await Promise.all([
      tenantDb("business_branches").whereNull("deleted_at").count("* as count"),
      tenantDb("business_services").whereNull("deleted_at").count("* as count"),
    ]);
    row.branch_count = Number(branchCount);
    row.service_count = Number(serviceCount);
  } catch {
    row.branch_count = 0;
    row.service_count = 0;
  }
  return row;
}

export async function insertBusiness(data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses").insert(data).returning("*");
  return row;
}

export async function updateBusiness(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteBusiness(id: number) {
  return masterKnex("businesses").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

export async function listBusinessMembers(
  businessId: number, schemaName: string,
  opts: { pointOfContact?: boolean; search?: string; limit: number; offset: number },
) {
  const db = await getKnex(businessId, schemaName);
  const base = () => {
    const q = db("agents as a").whereNull("a.deleted_at");
    if (opts.pointOfContact) q.where("a.admin_point_of_contact", true);
    if (opts.search) {
      q.where((qb) => {
        qb.whereILike("a.first_name", `%${opts.search}%`)
          .orWhereILike("a.last_name", `%${opts.search}%`)
          .orWhereILike("a.email", `%${opts.search}%`);
      });
    }
    return q;
  };
  const [{ count }] = await base().count<{ count: string }[]>("a.id as count");
  const rows = await base()
    .leftJoin("roles as r", "r.id", "a.role_id")
    .select(
      "a.id", "a.platform_user_id", "a.is_owner", "a.account_status", "a.admin_point_of_contact", "a.created_at",
      "r.name as role_name", "r.display_name as role_display_name",
    )
    .orderBy("a.is_owner", "desc")
    .orderBy("a.created_at")
    .limit(opts.limit)
    .offset(opts.offset);
  const total = Number(count);
  if (rows.length === 0) return { rows, total };
  const userIds = rows.map((r) => r.platform_user_id);
  const users = await masterKnex("platform_users").whereIn("id", userIds).select("id", "first_name", "last_name", "email", "phone", "photo_url");
  const byId = new Map(users.map((u) => [u.id, u]));
  return { rows: rows.map((r) => ({ ...r, user: byId.get(r.platform_user_id) ?? null })), total };
}

export async function listBusinessActivity(businessId: number, limit: number, offset: number) {
  const base = () =>
    masterKnex(`${S}.admin_audit_logs as l`).whereRaw("(l.details->>'business_id')::int = ?", [businessId]);
  const [{ count }] = await base().count<{ count: string }[]>("l.id as count");
  const rows = await base()
    .leftJoin(`${S}.admin_users as au`, "au.id", "l.admin_id")
    .leftJoin("platform_users as u", "u.id", "au.platform_user_id")
    .select("l.id", "l.action", "l.details", "l.created_at", "u.first_name as admin_first_name", "u.last_name as admin_last_name")
    .orderBy("l.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}
